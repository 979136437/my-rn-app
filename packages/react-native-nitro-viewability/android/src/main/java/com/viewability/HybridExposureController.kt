package com.viewability

import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.i18nmanager.I18nUtil
import com.facebook.react.uimanager.BackgroundStyleApplicator
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.style.LogicalEdge
import com.facebook.react.views.view.ReactViewGroup
import com.margelo.nitro.NitroModules
import com.margelo.nitro.viewability.ExposureConfig
import com.margelo.nitro.viewability.ExposureEvent
import com.margelo.nitro.viewability.HybridExposureControllerSpec
import com.viewability.core.ViewabilityIdentity
import com.viewability.core.ViewabilityTracker
import com.viewability.core.VisibilitySample
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicLong

/** All Android state is confined to the UI thread; JS commands invalidate old sessions immediately. */
open class HybridExposureController : HybridExposureControllerSpec(), LifecycleEventListener,
  View.OnAttachStateChangeListener, ViewTreeObserver.OnPreDrawListener,
  ViewTreeObserver.OnGlobalLayoutListener, ViewTreeObserver.OnScrollChangedListener,
  ViewTreeObserver.OnWindowFocusChangeListener {
  private val ui = Handler(Looper.getMainLooper())
  private val generation = AtomicLong()
  private val tracker = ViewabilityTracker()
  private var session = 0L
  private var commandGeneration = 0L
  private var target = WeakReference<View>(null)
  private var context = WeakReference<ReactApplicationContext>(null)
  private var tree = WeakReference<ViewTreeObserver>(null)
  private var tag = 0
  private var configuration: ExposureConfig? = null
  private var callback: ((ExposureEvent) -> Unit)? = null
  private var hostResumed = false
  private var windowFocused = false
  private var isViewable = false
  private var frame: Choreographer.FrameCallback? = null
  private var deadline: Runnable? = null
  private var resolution: Runnable? = null

  override fun observe(targetTag: Double, config: ExposureConfig, callback: (ExposureEvent) -> Unit) {
    require(targetTag.isFinite() && targetTag > 0 && targetTag <= Int.MAX_VALUE && targetTag % 1.0 == 0.0) {
      "ExposureController.observe requires a native View tag"
    }
    validate(config)
    val command = generation.incrementAndGet()
    ui.post {
      if (generation.get() != command) return@post
      clear()
      commandGeneration = command
      tag = targetTag.toInt()
      this.callback = callback
      restart(config)
    }
  }

  override fun configure(config: ExposureConfig) {
    validate(config)
    val command = generation.get()
    ui.post {
      if (generation.get() == command && callback != null && configuration != config) restart(config)
    }
  }

  override fun disconnect() {
    val command = generation.incrementAndGet()
    ui.post { if (generation.get() == command) clear() }
  }

  override fun dispose() { disconnect(); super.dispose() }

  private fun validate(config: ExposureConfig) {
    require(config.epoch.isFinite()) { "Exposure epoch must be finite" }
    require(config.visiblePercentThreshold.isFinite() && config.visiblePercentThreshold in 0.0..100.0) {
      "visiblePercentThreshold must be between 0 and 100"
    }
    require(config.minimumViewTime.isFinite() && config.minimumViewTime >= 0) { "minimumViewTime must be finite and nonnegative" }
  }

  private fun restart(config: ExposureConfig) {
    releaseBindings()
    session++
    configuration = config
    tracker.configure(config.visiblePercentThreshold, config.minimumViewTime)
    tracker.reset()
    isViewable = false
    emit(false, 0.0)
    resolve(session, 0)
  }

  private fun current(expected: Long = session): Boolean =
    expected == session && commandGeneration == generation.get() && callback != null

  private fun resolve(expected: Long, attempt: Int) {
    if (!current(expected)) return
    val reactContext = NitroModules.applicationContext
    val view = try {
      reactContext?.let { UIManagerHelper.getUIManagerForReactTag(it, tag)?.resolveView(tag) }
    } catch (_: RuntimeException) { null }
    if (view == null || reactContext == null) {
      if (attempt < 8) {
        resolution = Runnable { resolution = null; resolve(expected, attempt + 1) }.also { ui.postDelayed(it, 32) }
      } else {
        emit(false, 0.0, "Unable to resolve native View tag $tag. Forward the ref to a mounted View and set collapsable={false}.")
      }
      return
    }
    target = WeakReference(view)
    context = WeakReference(reactContext)
    hostResumed = reactContext.lifecycleState == LifecycleState.RESUMED
    reactContext.addLifecycleEventListener(this)
    view.addOnAttachStateChangeListener(this)
    bindTree(view)
    schedule()
  }

  private fun bindTree(view: View) {
    unbindTree()
    val observer = view.viewTreeObserver
    if (!observer.isAlive) return
    tree = WeakReference(observer)
    observer.addOnPreDrawListener(this)
    observer.addOnGlobalLayoutListener(this)
    observer.addOnScrollChangedListener(this)
    observer.addOnWindowFocusChangeListener(this)
    // A target can first bind (or reattach) while the notification shade is open.
    windowFocused = view.hasWindowFocus()
  }

  private fun unbindTree() {
    tree.get()?.takeIf { it.isAlive }?.let {
      it.removeOnPreDrawListener(this)
      it.removeOnGlobalLayoutListener(this)
      it.removeOnScrollChangedListener(this)
      it.removeOnWindowFocusChangeListener(this)
    }
    tree.clear()
    windowFocused = false
  }

  private fun schedule() {
    if (!current() || frame != null) return
    val expected = session
    frame = Choreographer.FrameCallback {
      frame = null
      if (current(expected)) sample()
    }.also { Choreographer.getInstance().postFrameCallback(it) }
  }

  private fun sample(forceInvisible: Boolean = false) {
    if (!current()) return
    deadline?.let(ui::removeCallbacks)
    deadline = null
    val config = configuration ?: return
    val now = SystemClock.uptimeMillis()
    val percent = if (!forceInvisible && hostResumed && windowFocused && config.enabled && config.active) {
      target.get()?.takeIf { it.hasWindowFocus() }?.let(::visiblePercent) ?: 0.0
    } else 0.0
    val identity = ViewabilityIdentity(config.key, config.epoch)
    val result = tracker.update(listOf(VisibilitySample(identity, percent)), now)
    val next = result.visible.isNotEmpty()
    if (next != isViewable) { isViewable = next; emit(next, percent) }
    val expected = session
    result.nextCheckDelayMs?.let { delay ->
      deadline = Runnable {
        deadline = null
        if (current(expected)) sample()
      }.also { ui.postAtTime(it, now + delay.coerceAtLeast(1).coerceAtMost(Long.MAX_VALUE - now)) }
    }
  }

  private fun emit(visible: Boolean, percent: Double, error: String? = null) {
    if (!current()) return
    val config = configuration ?: return
    callback?.invoke(ExposureEvent(config.key, config.epoch, visible, percent, SystemClock.uptimeMillis().toDouble(), error))
  }

  override fun onPreDraw(): Boolean { schedule(); return true }
  override fun onGlobalLayout() { schedule() }
  override fun onScrollChanged() { schedule() }
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    if (!current() || windowFocused == hasFocus) return
    windowFocused = hasFocus
    tracker.reset()
    // Losing focus need not pause the Activity or produce another draw. Deliver
    // the exit now and cancel its dwell deadline, even if no frame follows.
    if (hasFocus) schedule() else sample(forceInvisible = true)
  }
  override fun onViewAttachedToWindow(view: View) { bindTree(view); schedule() }
  override fun onViewDetachedFromWindow(view: View) { unbindTree(); tracker.reset(); sample(forceInvisible = true) }
  override fun onHostResume() { hostResumed = true; tracker.reset(); schedule() }
  override fun onHostPause() { hostResumed = false; tracker.reset(); sample() }
  override fun onHostDestroy() { hostResumed = false; tracker.reset(); sample(); clear() }

  private fun releaseBindings() {
    frame?.let { Choreographer.getInstance().removeFrameCallback(it) }
    frame = null
    deadline?.let(ui::removeCallbacks)
    deadline = null
    resolution?.let(ui::removeCallbacks)
    resolution = null
    unbindTree()
    target.get()?.removeOnAttachStateChangeListener(this)
    target.clear()
    context.get()?.removeLifecycleEventListener(this)
    context.clear()
  }

  private fun clear() {
    session++
    releaseBindings()
    tracker.reset()
    configuration = null
    callback = null
    isViewable = false
  }

  /** Axis-aligned bounds intentionally approximate rotation/skew, but preserve translation/scale. */
  private fun visiblePercent(view: View): Double {
    if (!view.isAttachedToWindow || !view.isShown || view.windowVisibility != View.VISIBLE || view.width <= 0 || view.height <= 0) return 0.0
    val full = boundsOnScreen(view, RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()))
    val area = full.width().toDouble() * full.height().toDouble()
    if (!area.isFinite() || area <= 0) return 0.0
    val visible = RectF(full)
    val window = Rect()
    view.getWindowVisibleDisplayFrame(window)
    if (!visible.intersect(RectF(window))) return 0.0
    // The visible display frame may extend outside a dialog or other small host window.
    val root = view.rootView
    if (!visible.intersect(boundsOnScreen(root, RectF(0f, 0f, root.width.toFloat(), root.height.toFloat())))) return 0.0
    var ancestor: View? = view
    while (ancestor != null) {
      val node = ancestor
      if (node.visibility != View.VISIBLE || node.alpha <= 0f) return 0.0
      node.clipBounds?.let { if (!visible.intersect(boundsOnScreen(node, RectF(it)))) return 0.0 }
      if (node !== view && node is ViewGroup) {
        // RN draws overflow clipping on Canvas even when clipChildren is false.
        // getClipBounds only exposes it behind an optional RN feature flag.
        if (node is ReactViewGroup && (node.overflow == "hidden" || node.overflow == "scroll")) {
          val paddingBox = reactPaddingBox(node)
          if (paddingBox.isEmpty || !visible.intersect(boundsOnScreen(node, paddingBox))) return 0.0
        }
        if (node.clipChildren && !visible.intersect(boundsOnScreen(node, RectF(0f, 0f, node.width.toFloat(), node.height.toFloat())))) return 0.0
        if (node.clipToPadding && (node.paddingLeft != 0 || node.paddingTop != 0 || node.paddingRight != 0 || node.paddingBottom != 0)) {
          val padded = RectF(node.paddingLeft.toFloat(), node.paddingTop.toFloat(),
            (node.width - node.paddingRight).toFloat(), (node.height - node.paddingBottom).toFloat())
          if (padded.isEmpty || !visible.intersect(boundsOnScreen(node, padded))) return 0.0
        }
      }
      ancestor = node.parent as? View
    }
    return (visible.width().toDouble() * visible.height().toDouble() / area * 100.0).coerceIn(0.0, 100.0)
  }

  /** RN's padding box excludes borders, not content padding; rounded corners stay approximate. */
  private fun reactPaddingBox(view: ReactViewGroup): RectF {
    fun border(vararg edges: LogicalEdge): Float =
      (edges.firstNotNullOfOrNull { BackgroundStyleApplicator.getBorderWidth(view, it) } ?: 0f) *
        view.resources.displayMetrics.density
    val rtl = view.layoutDirection == View.LAYOUT_DIRECTION_RTL
    val swap = rtl && I18nUtil.instance.doLeftAndRightSwapInRTL(view.context)
    val left = border(if (rtl) LogicalEdge.END else LogicalEdge.START,
      if (swap) LogicalEdge.RIGHT else LogicalEdge.LEFT, LogicalEdge.HORIZONTAL, LogicalEdge.ALL)
    val right = border(if (rtl) LogicalEdge.START else LogicalEdge.END,
      if (swap) LogicalEdge.LEFT else LogicalEdge.RIGHT, LogicalEdge.HORIZONTAL, LogicalEdge.ALL)
    val top = border(LogicalEdge.BLOCK_START, LogicalEdge.TOP, LogicalEdge.BLOCK, LogicalEdge.VERTICAL, LogicalEdge.ALL)
    val bottom = border(LogicalEdge.BLOCK_END, LogicalEdge.BOTTOM, LogicalEdge.BLOCK, LogicalEdge.VERTICAL, LogicalEdge.ALL)
    return RectF(left, top, view.width - right, view.height - bottom)
  }

  private fun boundsOnScreen(view: View, rect: RectF): RectF {
    globalMatrix(view).mapRect(rect)
    return rect
  }

  private fun globalMatrix(view: View): Matrix {
    val parent = view.parent as? View
    if (parent != null) {
      return globalMatrix(parent).apply {
        preTranslate((view.left - parent.scrollX).toFloat(), (view.top - parent.scrollY).toFloat())
        preConcat(view.matrix)
      }
    }
    val location = IntArray(2)
    view.getLocationOnScreen(location)
    val origin = floatArrayOf(0f, 0f)
    view.matrix.mapPoints(origin)
    return Matrix().apply {
      setTranslate(location[0] - origin[0], location[1] - origin[1])
      preConcat(view.matrix)
    }
  }
}
