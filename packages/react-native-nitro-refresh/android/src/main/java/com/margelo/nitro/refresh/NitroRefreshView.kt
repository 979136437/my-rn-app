package com.margelo.nitro.refresh

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.os.Build
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ScrollView
import com.facebook.react.uimanager.events.NativeGestureUtil
import com.facebook.react.views.scroll.ReactScrollView
import kotlin.math.abs

internal class NitroRefreshView(context: Context) : FrameLayout(context), RefreshTarget {
  val reactChildren = mutableListOf<View>()
  private val density = resources.displayMetrics.density
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var controllerId = ""
  private var active = false
  private var finishing = false
  private var disposed = false
  private var layoutPosted = false
  private var scrollLocked = false
  private var fingerDown = false
  private var dragging = false
  private var nativeGesture = false
  private var pointerId = MotionEvent.INVALID_POINTER_ID
  private var anchorX = 0f
  private var anchorY = 0f
  private var lastY = 0f
  private var dragOriginY = 0f
  private var dragOriginOffset = 0f
  private var offsetPx = 0f
  private var animator: ValueAnimator? = null
  private var animationGeneration = 0
  private val scroll: ScrollView? get() = reactChildren.getOrNull(1) as? ScrollView
  private val headerPx: Float get() = headerHeight * density

  var refreshEnabled = true
    set(value) {
      field = value
      if (!value && !active && offsetPx > 0) settleIdle()
    }
  var headerHeight = DEFAULT_HEADER_HEIGHT_DP
    set(value) {
      field = value
      requestLayout()
      if (active && !finishing) animateOffset(headerPx) {}
      else publishPull()
    }

  init { clipChildren = true }

  override fun dispatchDraw(canvas: Canvas) {
    // The header is laid out above this viewport. clipChildren only clips each
    // child's own bounds; clip the container too so it cannot cover sibling UI.
    val saveCount = canvas.save()
    canvas.clipRect(0, 0, width, height)
    super.dispatchDraw(canvas)
    canvas.restoreToCount(saveCount)
  }

  private fun controller() = RefreshRegistry.find(controllerId)

  private fun publishPull() {
    controller()?.emitPull((offsetPx / density).toDouble(), headerHeight.toDouble(), dragging && fingerDown && !scrollLocked)
  }

  private fun setOffset(value: Float) {
    offsetPx = value.coerceAtLeast(0f)
    for (child in reactChildren) child.translationY = offsetPx
    publishPull()
  }

  private fun cancelAnimation() {
    animationGeneration++
    val old = animator
    animator = null
    old?.cancel()
  }

  private fun animateOffset(target: Float, complete: () -> Unit) {
    cancelAnimation()
    val generation = animationGeneration
    val animationsEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ValueAnimator.areAnimatorsEnabled()
      else Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    if (!animationsEnabled || offsetPx == target) {
      setOffset(target)
      complete()
      return
    }
    animator = ValueAnimator.ofFloat(offsetPx, target).apply {
      duration = REFRESH_OPEN_DURATION_MS.toLong()
      interpolator = DecelerateInterpolator()
      addUpdateListener { if (generation == animationGeneration && !disposed) setOffset(it.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          if (generation != animationGeneration || disposed) return
          animator = null
          complete()
        }
      })
      start()
    }
  }

  private fun setScrollLocked(locked: Boolean) {
    if (scrollLocked == locked) return
    scrollLocked = locked
    if (locked) {
      (scroll as? ReactScrollView)?.abortAnimation()
      super.requestDisallowInterceptTouchEvent(false)
    }
  }

  override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
    // Observe top-of-list transitions even when RN's scroll view owns the drag.
    // Direction and touch slop below keep taps and horizontal children intact.
    super.requestDisallowInterceptTouchEvent(disallowIntercept && !scrollLocked && !refreshEnabled)
  }

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        fingerDown = true
        pointerId = event.getPointerId(0)
        anchorX = event.x
        anchorY = event.y
        lastY = event.y
        dragging = false
      }
      MotionEvent.ACTION_POINTER_UP -> {
        val leaving = event.actionIndex
        if (event.getPointerId(leaving) == pointerId) {
          val next = if (leaving == 0) 1 else 0
          if (next < event.pointerCount) {
            pointerId = event.getPointerId(next)
            anchorX = event.getX(next)
            anchorY = event.getY(next)
            lastY = anchorY
            dragOriginY = anchorY
            dragOriginOffset = offsetPx
          }
        }
      }
    }
    val handled = super.dispatchTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_MOVE && !dragging && !scrollLocked) {
      val index = event.findPointerIndex(pointerId)
      if (index >= 0) {
        // A child can reach its top while processing this very MOVE.
        if (scroll?.canScrollVertically(-1) == true) anchorY = event.getY(index)
        lastY = event.getY(index)
      }
    }
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
      fingerDown = false
      dragging = false
      pointerId = MotionEvent.INVALID_POINTER_ID
      if (nativeGesture) {
        NativeGestureUtil.notifyNativeGestureEnded(this, event)
        nativeGesture = false
      }
      publishPull()
    }
    return handled
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked != MotionEvent.ACTION_MOVE) return false
    val index = event.findPointerIndex(pointerId)
    if (index < 0) return false
    val x = event.getX(index)
    val y = event.getY(index)
    val dy = y - anchorY
    val dx = x - anchorX
    if (abs(dy) <= touchSlop || abs(dy) <= abs(dx)) return false
    val content = scroll ?: return false
    val canPull = refreshEnabled && !active && !finishing && controllerId.isNotEmpty() &&
      (content as? ReactScrollView)?.scrollEnabled != false && !content.canScrollVertically(-1) && dy > 0
    if (!scrollLocked && !canPull) return false
    if (canPull && !scrollLocked) {
      cancelAnimation()
      dragging = true
      dragOriginY = lastY
      dragOriginOffset = offsetPx
    }
    nativeGesture = true
    NativeGestureUtil.notifyNativeGestureStarted(this, event)
    return true // ViewGroup delivers ACTION_CANCEL to the child's current target.
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!nativeGesture) return false
    val index = event.findPointerIndex(pointerId)
    if (event.actionMasked == MotionEvent.ACTION_MOVE && index >= 0 && dragging && !scrollLocked) {
      val raw = dragOriginOffset + (event.getY(index) - dragOriginY) * REFRESH_DRAG_DAMPING
      setOffset(raw.coerceIn(0f, headerPx * REFRESH_MAX_DRAG_RATE))
      controller()?.emitState(if (offsetPx >= headerPx) RefreshState.READY else RefreshState.PULLING)
    }
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
      val shouldRefresh = dragging && !scrollLocked && refreshEnabled &&
        event.actionMasked == MotionEvent.ACTION_UP && offsetPx >= headerPx
      dragging = false
      fingerDown = false
      if (shouldRefresh) startRefresh(true)
      else if (!active && !finishing && offsetPx > 0) settleIdle()
      else if (!active && !finishing) controller()?.emitState(RefreshState.IDLE)
    }
    return true
  }

  override fun startRefresh(notify: Boolean) {
    if (disposed || active || finishing || scroll == null || (notify && !refreshEnabled)) return
    if (notify && !dragging && offsetPx == 0f) scroll?.scrollTo(scroll!!.scrollX, 0)
    active = true
    dragging = false
    setScrollLocked(true)
    // Notify before animation: controlled false can immediately reject this request.
    controller()?.refreshStarted(notify)
    if (active && !finishing) animateOffset(headerPx) {}
  }

  private fun settleIdle() {
    if (finishing || disposed) return
    finishing = true
    dragging = false
    controller()?.emitState(RefreshState.FINISHING)
    animateOffset(0f) {
      active = false
      finishing = false
      setScrollLocked(false)
      controller()?.emitState(RefreshState.IDLE)
    }
  }

  override fun finishRefresh() {
    if (active) settleIdle()
  }

  private fun reset() {
    cancelAnimation()
    active = false
    finishing = false
    dragging = false
    fingerDown = false
    nativeGesture = false
    pointerId = MotionEvent.INVALID_POINTER_ID
    setScrollLocked(false)
    offsetPx = 0f
    for (child in reactChildren) child.translationY = 0f
  }

  fun setControllerId(id: String) {
    if (id == controllerId) return
    controller()?.unbind(this)
    reset()
    controllerId = id
    bindWhenReady()
  }

  fun mount(child: View, index: Int) {
    check(reactChildren.size < 2) { "NitroRefreshControl expects a header and one vertical scroll view" }
    if (index == 1) check(child is ScrollView) { "NitroRefreshControl supports vertical, non-inverted RN scroll views" }
    reactChildren.add(index, child)
    addView(child, index, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    requestLayout()
  }

  fun unmount(index: Int) {
    controller()?.unbind(this)
    reset()
    removeView(reactChildren.removeAt(index))
  }

  private fun bindWhenReady() {
    if (!disposed && isAttachedToWindow && reactChildren.size == 2 && width > 0 && height > 0) controller()?.bind(this)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    for ((index, child) in reactChildren.withIndex()) {
      child.measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(if (index == 0) headerPx.toInt() else measuredHeight, MeasureSpec.EXACTLY))
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    reactChildren.getOrNull(0)?.layout(0, -headerPx.toInt(), width, 0)
    scroll?.layout(0, 0, width, height)
    bindWhenReady()
  }

  override fun requestLayout() {
    super.requestLayout()
    if (layoutPosted || disposed) return
    layoutPosted = true
    post {
      layoutPosted = false
      if (!disposed && isAttachedToWindow && width > 0 && height > 0) {
        measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
        layout(left, top, right, bottom)
      }
    }
  }

  override fun onAttachedToWindow() { super.onAttachedToWindow(); requestLayout() }
  override fun onDetachedFromWindow() { controller()?.unbind(this); reset(); super.onDetachedFromWindow() }
  fun release() { controller()?.unbind(this); disposed = true; reset(); controllerId = "" }
}
