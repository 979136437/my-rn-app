package com.margelo.nitro.refresh

import android.content.Context
import android.graphics.Matrix
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewConfiguration
import android.widget.FrameLayout
import android.widget.ScrollView
import com.facebook.react.uimanager.events.NativeGestureUtil
import com.facebook.react.views.scroll.ReactScrollView
import com.scwang.smart.refresh.layout.SmartRefreshLayout
import com.scwang.smart.refresh.layout.api.RefreshHeader
import com.scwang.smart.refresh.layout.api.RefreshLayout
import com.scwang.smart.refresh.layout.constant.RefreshState as SmartState
import com.scwang.smart.refresh.layout.simple.SimpleComponent
import kotlin.math.abs

internal class NitroRefreshView(context: Context) : FrameLayout(context), RefreshTarget {
  val reactChildren = mutableListOf<View>()
  private val density = resources.displayMetrics.density.toDouble()
  private var controllerId = ""
  private var active = false
  private var finishing = false
  private var notifyNext = true
  private var layoutPosted = false
  private var disposed = false
  private var fingerDown = false
  private var scrollLocked = false
  private var interceptingScroll = false
  private var touchStartY = 0f
  private var pullOffset = 0.0
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val smart = object : SmartRefreshLayout(context) {
    private var nativeGesture = false
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_DOWN) fingerDown = true
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
        fingerDown = false
        controller()?.emitPull(pullOffset, headerHeight.toDouble(), false)
      }
      if (scrollLocked) {
        // Keep clicks, but bypass Smart's drag/animation interruption logic.
        val content = mRefreshContent?.view ?: return false
        val localEvent = MotionEvent.obtain(event)
        try {
          localEvent.offsetLocation((scrollX - content.left).toFloat(), (scrollY - content.top).toFloat())
          if (!content.matrix.isIdentity) {
            val inverse = Matrix()
            if (content.matrix.invert(inverse)) localEvent.transform(inverse)
          }
          return content.dispatchTouchEvent(localEvent)
        } finally {
          localEvent.recycle()
        }
      }
      return super.dispatchTouchEvent(event)
    }
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
      val intercepted = super.onInterceptTouchEvent(event)
      if (intercepted && !nativeGesture && event.actionMasked == MotionEvent.ACTION_MOVE) {
        NativeGestureUtil.notifyNativeGestureStarted(this, event)
        nativeGesture = true
      }
      return intercepted
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
      val handled = super.onTouchEvent(event)
      if (nativeGesture && (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL)) {
        NativeGestureUtil.notifyNativeGestureEnded(this, event)
        nativeGesture = false
      }
      return handled
    }
  }
  private val header = object : SimpleComponent(context, null, 0), RefreshHeader {
    override fun onMoving(isDragging: Boolean, percent: Float, offset: Int, height: Int, maxDragHeight: Int) {
      pullOffset = offset.coerceAtLeast(0) / density
      controller()?.emitPull(pullOffset, headerHeight.toDouble(), isDragging && fingerDown && !scrollLocked)
    }
    override fun onStateChanged(layout: RefreshLayout, oldState: SmartState, newState: SmartState) {
      if (newState == SmartState.RefreshReleased || newState == SmartState.Refreshing) setScrollLocked(true)
      val state = when (newState) {
        SmartState.PullDownToRefresh -> RefreshState.PULLING
        SmartState.ReleaseToRefresh -> RefreshState.READY
        SmartState.RefreshReleased, SmartState.Refreshing -> RefreshState.REFRESHING
        SmartState.RefreshFinish -> RefreshState.FINISHING
        SmartState.PullDownCanceled -> RefreshState.FINISHING
        else -> RefreshState.IDLE
      }
      if (newState == SmartState.None) {
        active = false
        finishing = false
        notifyNext = true
        setScrollLocked(false)
        smart.setEnableRefresh(refreshEnabled && controllerId.isNotEmpty())
        pullOffset = 0.0
        controller()?.emitPull(pullOffset, headerHeight.toDouble(), false)
      }
      controller()?.emitState(state)
    }
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
      for (i in 0 until childCount) getChildAt(i).layout(0, 0, width, height)
    }
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
      super.onMeasure(widthMeasureSpec, heightMeasureSpec)
      for (i in 0 until childCount) {
        getChildAt(i).measure(
          MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY)
        )
      }
    }
  }
  var refreshEnabled = true
    set(value) {
      field = value
      smart.setEnableRefresh((value || active) && controllerId.isNotEmpty())
      smart.invalidate()
    }
  var headerHeight = DEFAULT_HEADER_HEIGHT_DP
    set(value) {
      field = value
      smart.setHeaderHeight(value)
      requestLayout()
    }

  init {
    smart.setEnableLoadMore(false)
    smart.setEnableAutoLoadMore(false)
    smart.setEnableRefresh(false)
    smart.setEnableOverScrollBounce(false)
    smart.setHeaderTriggerRate(REFRESH_TRIGGER_RATE)
    smart.setRefreshHeader(header, LayoutParams.MATCH_PARENT, (headerHeight * density).toInt())
    smart.setRefreshContent(FrameLayout(context))
    smart.setOnRefreshListener {
      if (disposed || !isAttachedToWindow || finishing || smart.state != SmartState.Refreshing) return@setOnRefreshListener
      active = true
      pullOffset = headerHeight.toDouble()
      controller()?.emitPull(pullOffset, headerHeight.toDouble(), false)
      val notify = notifyNext
      notifyNext = true
      controller()?.refreshStarted(notify)
    }
    addView(smart, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private fun controller() = RefreshRegistry.find(controllerId)

  private fun setScrollLocked(locked: Boolean) {
    if (scrollLocked == locked) return
    scrollLocked = locked
    if (locked) {
      (reactChildren.getOrNull(1) as? ReactScrollView)?.abortAnimation()
      // A child may have disallowed interception before refreshing started.
      super.requestDisallowInterceptTouchEvent(false)
    }
  }

  override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
    super.requestDisallowInterceptTouchEvent(disallowIntercept && !scrollLocked)
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      touchStartY = event.y
      interceptingScroll = false
    }
    if (scrollLocked && event.actionMasked == MotionEvent.ACTION_MOVE) {
      val deltaY = abs(event.y - touchStartY)
      if (deltaY >= touchSlop) {
        interceptingScroll = true
        NativeGestureUtil.notifyNativeGestureStarted(this, event)
        return true // ViewGroup sends CANCEL to the previous child touch target.
      }
    }
    return super.onInterceptTouchEvent(event)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!interceptingScroll) return super.onTouchEvent(event)
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
      NativeGestureUtil.notifyNativeGestureEnded(this, event)
      interceptingScroll = false
    }
    return true
  }

  fun setControllerId(id: String) {
    if (id == controllerId) return
    controller()?.unbind(this)
    finishRefresh()
    setScrollLocked(false)
    controllerId = id
    smart.setEnableRefresh(refreshEnabled && id.isNotEmpty())
    // Smart caches drawChild while disabled; translation alone does not redraw it.
    smart.invalidate()
    bindWhenReady()
  }

  fun mount(child: View, index: Int) {
    check(reactChildren.size < 2) { "NitroRefreshControl expects a header and one vertical scroll view" }
    reactChildren.add(index, child)
    if (index == 0) header.addView(child, ViewGroup.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    else {
      check(child is ScrollView) { "NitroRefreshControl supports vertical, non-inverted RN scroll views" }
      smart.setRefreshContent(child)
    }
    requestLayout()
  }

  fun unmount(index: Int) {
    val child = reactChildren.removeAt(index)
    controller()?.unbind(this)
    finishRefresh()
    setScrollLocked(false)
    (child.parent as? ViewGroup)?.removeView(child)
  }

  private fun bindWhenReady() {
    if (!disposed && isAttachedToWindow && reactChildren.size == 2 && width > 0 && height > 0) {
      controller()?.bind(this)
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    smart.layout(0, 0, width, height)
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

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    requestLayout()
  }

  override fun onDetachedFromWindow() {
    controller()?.unbind(this)
    finishRefresh()
    setScrollLocked(false)
    super.onDetachedFromWindow()
  }

  override fun startRefresh(notify: Boolean) {
    if (disposed || active || finishing || (notify && !refreshEnabled)) return
    val scroll = reactChildren.getOrNull(1) as? ScrollView ?: return
    if (notify) {
      scroll.scrollTo(scroll.scrollX, 0)
    }
    active = true
    setScrollLocked(true)
    notifyNext = notify
    smart.setEnableRefresh(true)
    smart.invalidate()
    if (!smart.autoRefresh(0, REFRESH_OPEN_DURATION_MS, REFRESH_TRIGGER_RATE, !notify)) {
      active = false
      setScrollLocked(false)
      notifyNext = true
      smart.setEnableRefresh(refreshEnabled && controllerId.isNotEmpty())
    } else if (!notify) controller()?.refreshStarted(false)
  }

  override fun finishRefresh() {
    if (!active && !smart.state.isOpening) return
    finishing = true
    controller()?.emitState(RefreshState.FINISHING)
    smart.finishRefresh(0)
  }

  fun release() {
    controller()?.unbind(this)
    disposed = true
    setScrollLocked(false)
    smart.setOnRefreshListener(null)
    smart.closeHeaderOrFooter()
    controllerId = ""
  }
}
