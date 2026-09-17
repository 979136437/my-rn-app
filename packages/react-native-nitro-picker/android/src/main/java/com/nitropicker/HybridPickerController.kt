package com.nitropicker

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.AnimationUtils
import android.widget.OverScroller
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.NativeGestureUtil
import com.facebook.react.views.scroll.ReactScrollView
import com.margelo.nitro.NitroModules
import com.margelo.nitro.picker.HybridPickerControllerSpec
import com.margelo.nitro.picker.PickerConfig
import com.margelo.nitro.picker.PickerEvent
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong
import java.util.WeakHashMap
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Fabric/RN owns the ScrollView, its content layout and scroll-offset state.
 * This controller owns native input and physics; ScrollView's built-in input is
 * disabled by JS to avoid two competing fling/gesture implementations.
 * All view access and physics run on the UI thread, never the JS frame loop.
 */
open class HybridPickerController : HybridPickerControllerSpec(), View.OnTouchListener,
  View.OnLayoutChangeListener, View.OnAttachStateChangeListener, LifecycleEventListener {
  private val ui = Handler(Looper.getMainLooper())
  private val generation = AtomicLong()
  private var session = 0L
  private var target = WeakReference<ReactScrollView>(null)
  private var content = WeakReference<View>(null)
  private var context = WeakReference<ReactApplicationContext>(null)
  private var config: PickerConfig? = null
  private var callback: ((PickerEvent) -> Unit)? = null
  private var resolution: Runnable? = null
  private var frame: Runnable? = null
  private var scroller: OverScroller? = null
  private var snapMotion: SnapMotion? = null
  private var touchSettings: ViewConfiguration? = null
  private var velocity: VelocityTracker? = null
  private var lastMotion: MotionEvent? = null
  private var pointer = -1
  private var lastY = 0f
  private var downY = 0f
  private var dragging = false
  private var active = false
  private var pendingPosition = true
  private var reported = -1
  private var selected = -1
  private var fractionalY = 0f
  private var touchRoot: View? = null
  private var gestureRoot: View? = null
  private var touchBlocked = false
  private var settleOnRelease = false

  override fun connect(viewTag: Double, config: PickerConfig, callback: (PickerEvent) -> Unit) {
    require(viewTag.isFinite() && viewTag > 0 && viewTag <= Int.MAX_VALUE && viewTag % 1.0 == 0.0)
    validate(config)
    val command = generation.incrementAndGet()
    ui.post {
      if (generation.get() != command) return@post
      clear()
      session = command
      this.config = config
      this.callback = callback
      selected = config.selectedIndex.toInt()
      reported = selected
      resolve(viewTag.toInt(), 0)
    }
  }

  override fun configure(config: PickerConfig) {
    validate(config)
    val command = generation.get()
    ui.post {
      if (!current(command)) return@post
      val old = this.config ?: return@post
      val structural = old.epoch != config.epoch || old.count != config.count || old.itemHeight != config.itemHeight
      val changed = old.selectedIndex != config.selectedIndex
      // A controlled onChange acknowledgement must not cancel the fling it came from.
      val acknowledgement = active && !structural && config.selectedIndex.toInt() == reported
      if (structural || (changed && !acknowledgement)) cancelCycle(preserveTouch = true)
      this.config = config
      if (acknowledgement) return@post
      if (structural || changed || (!active && pointer < 0)) {
        selected = config.selectedIndex.toInt()
        reported = selected
        pendingPosition = true
        positionIfReady()
      }
    }
  }

  override fun step(delta: Double) {
    val command = generation.get()
    ui.post {
      if (!current(command) || delta == 0.0 || !delta.isFinite()) return@post
      val view = target.get() ?: return@post
      if (!ready(view) || count() == 0) return@post
      val next = (nearest(view.scrollY) + if (delta > 0) 1 else -1).coerceIn(0, count() - 1)
      cancelCycle()
      begin()
      if (config?.immediateChange == true) report(next)
      animateTo(next)
    }
  }

  override fun stop() {
    val command = generation.get()
    ui.post {
      if (!current(command)) return@post
      cancelCycle()
      pendingPosition = true
      positionIfReady()
    }
  }

  override fun disconnect() {
    val command = generation.incrementAndGet()
    ui.post { if (generation.get() == command) clear() }
  }

  override fun dispose() { disconnect(); super.dispose() }

  private fun current(expected: Long = session) = expected == session && generation.get() == expected && callback != null
  private fun count() = config?.count?.toInt() ?: 0
  private fun rowHeight() = PixelUtil.toPixelFromDIP(config?.itemHeight ?: 44.0).toDouble()
  private fun offset(index: Int) = (index.coerceAtLeast(0) * rowHeight()).roundToInt()
  private fun maxOffset() = offset(count() - 1)
  private fun nearest(y: Int) = if (count() == 0) -1 else (y / rowHeight()).roundToInt().coerceIn(0, count() - 1)

  private fun validate(config: PickerConfig) {
    require(config.epoch.isFinite() && config.count.isFinite() && config.count >= 0 && config.count <= Int.MAX_VALUE && config.count % 1.0 == 0.0)
    require(config.itemHeight.isFinite() && config.itemHeight > 0)
    require(config.selectedIndex.isFinite() && config.selectedIndex % 1.0 == 0.0)
    require(if (config.count == 0.0) config.selectedIndex == -1.0 else config.selectedIndex >= 0 && config.selectedIndex < config.count)
    require(config.count * PixelUtil.toPixelFromDIP(config.itemHeight) < Int.MAX_VALUE) { "Picker content exceeds Android scroll coordinate range" }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun resolve(tag: Int, attempt: Int) {
    if (!current()) return
    val reactContext = NitroModules.applicationContext
    val view = try { reactContext?.let { UIManagerHelper.getUIManagerForReactTag(it, tag)?.resolveView(tag) } }
      catch (_: RuntimeException) { null }
    if (view == null && attempt < 12) {
      val expected = session
      resolution = Runnable { resolution = null; if (current(expected)) resolve(tag, attempt + 1) }
        .also { ui.postDelayed(it, 16) }
      return
    }
    if (view !is ReactScrollView || reactContext == null) {
      emit("error", -1, "Unable to connect to Fabric ScrollView tag $tag.")
      return
    }
    target = WeakReference(view)
    context = WeakReference(reactContext)
    scroller = OverScroller(view.context)
    touchSettings = ViewConfiguration.get(view.context)
    view.setOnTouchListener(this)
    view.addOnLayoutChangeListener(this)
    view.addOnAttachStateChangeListener(this)
    reactContext.addLifecycleEventListener(this)
    bindContent()
    pendingPosition = true
    positionIfReady()
  }

  private fun bindContent() {
    val next = target.get()?.let { if (it.childCount > 0) it.getChildAt(0) else null }
    if (next === content.get()) return
    content.get()?.removeOnLayoutChangeListener(this)
    content = WeakReference(next)
    next?.addOnLayoutChangeListener(this)
  }

  private fun ready(view: ReactScrollView): Boolean {
    bindContent()
    val child = content.get() ?: return false
    // Await the Fabric layout containing new rows and symmetric padding. Do not
    // clamp a command against the previous content size and lose the selection.
    val expectedHeight = count() * rowHeight() + maxOf(0.0, view.height - rowHeight())
    return view.height > 0 && view.width > 0 && abs(child.height - expectedHeight) <= 3.0
  }

  private fun positionIfReady() {
    val view = target.get() ?: return
    if (!pendingPosition || !ready(view)) return
    pendingPosition = false
    view.scrollTo(0, offset(selected))
    fractionalY = view.scrollY.toFloat()
  }

  override fun onLayoutChange(v: View, left: Int, top: Int, right: Int, bottom: Int,
    oldLeft: Int, oldTop: Int, oldRight: Int, oldBottom: Int) {
    if (!current()) return
    bindContent()
    val resized = right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop
    if (!resized && !pendingPosition) return
    if (resized && active) cancelCycle(preserveTouch = true)
    pendingPosition = true
    positionIfReady()
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouch(v: View, event: MotionEvent): Boolean {
    val view = target.get() ?: return false
    if (!current()) {
      cancelCycle()
      return false
    }
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      val interrupted = active
      cancelCycle()
      // A tap that stops inertia must still settle, even if it never crosses
      // touch slop or the stopped position is already centered on another row.
      settleOnRelease = interrupted || (count() > 0 &&
        (abs(view.scrollY - offset(nearest(view.scrollY))) > 1 || nearest(view.scrollY) != selected))
    }
    lastMotion?.recycle()
    // VelocityTracker consumes the original batched samples below. Gesture
    // cancellation only needs the latest coordinates, not a copy of all history.
    lastMotion = MotionEvent.obtainNoHistory(event)
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      // Claim the stream before checking row count/layout or touch slop. Empty
      // and temporarily unavailable columns must not scroll the outer page.
      touchRoot = view.rootView.also { root -> touches[root] = (touches[root] ?: 0) + 1 }
      view.parent?.requestDisallowInterceptTouchEvent(true)
      gestureRoot = view.rootView.also { root ->
        val previous = gestures[root] ?: 0
        gestures[root] = previous + 1
        if (previous == 0) NativeGestureUtil.notifyNativeGestureStarted(view, event)
      }
    }
    if (touchBlocked || count() == 0 || !ready(view)) {
      // Invalidate wheel movement without surrendering this finger's stream.
      // The column resumes accepting new drags only after UP/CANCEL.
      cancelCycle(preserveTouch = true)
      pendingPosition = true
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) releaseTouch()
      return true
    }
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        pointer = event.getPointerId(0)
        lastY = event.y
        downY = lastY
        fractionalY = view.scrollY.toFloat()
        velocity = VelocityTracker.obtain().also { it.addMovement(event) }
      }
      MotionEvent.ACTION_MOVE -> {
        val index = event.findPointerIndex(pointer)
        if (index < 0) return true
        velocity?.addMovement(event)
        val y = event.getY(index)
        val slop = touchSettings?.scaledTouchSlop ?: 0
        if (!dragging && abs(y - downY) > slop) {
          // Consume only the distance beyond touch slop on the first drag frame.
          // This avoids a large jump when the first MOVE is delivered in a batch.
          lastY = downY + if (y > downY) slop.toFloat() else -slop.toFloat()
          dragging = true
          begin()
        }
        if (dragging) {
          fractionalY = (fractionalY + lastY - y).coerceIn(0f, maxOffset().toFloat())
          scheduleFrame()
        }
        lastY = y
      }
      MotionEvent.ACTION_POINTER_UP -> {
        if (event.getPointerId(event.actionIndex) == pointer) {
          val replacement = if (event.actionIndex == 0) 1 else 0
          pointer = event.getPointerId(replacement)
          lastY = event.getY(replacement)
          downY = lastY
          velocity?.clear()
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        val wasDragging = dragging
        val needsSettlement = settleOnRelease
        velocity?.addMovement(event)
        val settings = touchSettings ?: ViewConfiguration.get(view.context)
        velocity?.computeCurrentVelocity(1000, settings.scaledMaximumFlingVelocity.toFloat())
        val speed = if (event.actionMasked == MotionEvent.ACTION_CANCEL) 0 else -(velocity?.getYVelocity(pointer) ?: 0f).roundToInt()
        if (wasDragging) {
          val index = event.findPointerIndex(pointer)
          if (event.actionMasked == MotionEvent.ACTION_UP && index >= 0) {
            fractionalY = (fractionalY + lastY - event.getY(index)).coerceIn(0f, maxOffset().toFloat())
          }
          // Commit the final touch position before predicting inertia, including
          // when UP arrives before the queued display frame.
          frame?.let { view.removeCallbacks(it) }
          frame = null
          applyDragPosition(view)
        }
        releaseTouch()
        if (wasDragging) {
          val physics = scroller ?: return true
          if (abs(speed) >= settings.scaledMinimumFlingVelocity) {
            physics.fling(0, view.scrollY, 0, speed, 0, 0, 0, maxOffset())
            val next = nearest(physics.finalY)
            physics.forceFinished(true)
            if (config?.immediateChange == true) report(next)
            // Use native physics to predict the row, then decelerate straight
            // into it. Never stop between free-running inertia and alignment.
            animateTo(next, speed.toDouble())
          } else {
            val next = nearest(view.scrollY)
            if (config?.immediateChange == true) report(next)
            animateTo(next)
          }
        } else if (needsSettlement) {
          begin()
          val next = nearest(view.scrollY)
          if (config?.immediateChange == true) report(next)
          animateTo(next)
        } else view.performClick()
      }
    }
    return true
  }

  private fun begin() {
    active = true
    pendingPosition = false
    emit("start", selected)
  }

  private fun report(index: Int) {
    selected = index
    if (index != reported) {
      reported = index
      emit("change", index)
    }
  }

  private fun animateTo(index: Int, releaseVelocity: Double = 0.0) {
    val view = target.get() ?: return
    val destination = offset(index)
    val distance = destination - view.scrollY
    if (abs(distance) <= 1) { finish(); return }
    val duration = if (releaseVelocity * distance > 0.0)
      (3000.0 * abs(distance) / abs(releaseVelocity)).roundToInt().coerceIn(180, 1000)
      else (180 + 110 * sqrt(abs(distance) / rowHeight())).roundToInt().coerceIn(180, 340)
    // Cubic Hermite interpolation carries the release velocity into a zero-
    // velocity landing. Limiting the normalized tangent to [0, 3] guarantees
    // monotonic motion: no overshoot, reverse correction or abrupt final snap.
    val tangent = (releaseVelocity * duration / 1000.0 / distance).coerceIn(0.0, 3.0)
    snapMotion = SnapMotion(view.scrollY, destination, AnimationUtils.currentAnimationTimeMillis(), duration, tangent)
    scheduleFrame()
  }

  private fun scheduleFrame() {
    if (frame != null) return
    val view = target.get() ?: return
    val expected = session
    frame = Runnable {
      frame = null
      if (!current(expected) || !active) return@Runnable
      if (dragging) {
        applyDragPosition(view)
        return@Runnable
      }
      val motion = snapMotion ?: return@Runnable
      val progress = ((AnimationUtils.currentAnimationTimeMillis() - motion.startedAt).toDouble() / motion.duration).coerceIn(0.0, 1.0)
      val remaining = 1.0 - progress
      val eased = progress * progress * (3.0 - 2.0 * progress) + motion.tangent * progress * remaining * remaining
      val y = motion.start + (motion.destination - motion.start) * eased
      val position = y.roundToInt().coerceIn(0, maxOffset())
      if (view.scrollY != position) view.scrollTo(0, position)
      if (progress < 1.0) scheduleFrame() else finish()
    }.also { view.postOnAnimation(it) }
  }

  private fun applyDragPosition(view: ReactScrollView) {
    val position = fractionalY.roundToInt().coerceIn(0, maxOffset())
    if (view.scrollY != position) view.scrollTo(0, position)
  }

  private fun finish() {
    val view = target.get() ?: return
    snapMotion = null
    report(nearest(view.scrollY))
    active = false
    emit("end", selected)
  }

  private fun emit(phase: String, index: Int, error: String = "") {
    if (!current()) return
    val epoch = config?.epoch ?: return
    callback?.invoke(PickerEvent(epoch, index.toDouble(), phase, error))
  }

  private fun releaseTouch(preserveTouch: Boolean = false) {
    val view = target.get()
    settleOnRelease = false
    if (preserveTouch && touchRoot != null) {
      touchBlocked = true
      dragging = false
      pointer = -1
      velocity?.recycle()
      velocity = null
      return
    }
    touchBlocked = false
    gestureRoot?.let { root ->
      val remaining = (gestures[root] ?: 1) - 1
      if (remaining == 0) {
        gestures.remove(root)
        if (view != null) lastMotion?.let { NativeGestureUtil.notifyNativeGestureEnded(view, it) }
      } else gestures[root] = remaining
    }
    gestureRoot = null
    touchRoot?.let { root ->
      val remaining = (touches[root] ?: 1) - 1
      if (remaining == 0) {
        touches.remove(root)
        view?.parent?.requestDisallowInterceptTouchEvent(false)
      } else touches[root] = remaining
    }
    touchRoot = null
    dragging = false
    pointer = -1
    velocity?.recycle()
    velocity = null
    lastMotion?.recycle()
    lastMotion = null
  }

  private fun cancelCycle(preserveTouch: Boolean = false) {
    frame?.let { target.get()?.removeCallbacks(it) }
    frame = null
    snapMotion = null
    scroller?.forceFinished(true)
    releaseTouch(preserveTouch)
    if (active) { active = false; emit("end", selected) }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun clear() {
    cancelCycle()
    resolution?.let { ui.removeCallbacks(it) }
    resolution = null
    target.get()?.let {
      it.setOnTouchListener(null)
      it.removeOnLayoutChangeListener(this)
      it.removeOnAttachStateChangeListener(this)
    }
    content.get()?.removeOnLayoutChangeListener(this)
    context.get()?.removeLifecycleEventListener(this)
    target.clear()
    content.clear()
    context.clear()
    callback = null
    config = null
    scroller = null
    touchSettings = null
    pendingPosition = true
  }

  override fun onViewAttachedToWindow(v: View) { bindContent(); pendingPosition = true; positionIfReady() }
  override fun onViewDetachedFromWindow(v: View) { cancelCycle(); pendingPosition = true }
  override fun onHostResume() { positionIfReady() }
  override fun onHostPause() { cancelCycle(); pendingPosition = true; positionIfReady() }
  override fun onHostDestroy() { disconnect() }

  private data class SnapMotion(
    val start: Int,
    val destination: Int,
    val startedAt: Long,
    val duration: Int,
    val tangent: Double,
  )

  companion object {
    // UI-thread-only ownership shared by columns in the same Android window.
    // Lifting one finger must not let an outer ScrollView steal the other column.
    private val touches = WeakHashMap<View, Int>()
    private val gestures = WeakHashMap<View, Int>()
  }
}
