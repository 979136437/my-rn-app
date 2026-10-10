package com.margelo.nitro.picker

import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSnapHelper
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.NativeGestureUtil
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.roundToInt

internal class NitroPickerColumn(private val reactContext: ThemedReactContext) : ReactViewGroup(reactContext), PickerTarget {
  val reactChildren = mutableListOf<View>()
  private var controllerId = ""
  private var requestedIndex = 0
  private var revision = 0.0
  private var picking = false
  private var dirty = false
  private var pendingSelection = true
  private var released = false
  private var layoutQueued = false
  private var ready = false
  private var cancelling = false
  private var touching = false
  private var ignoreTouch = false
  private var nativeGesture = false
  private var currentTouch: MotionEvent? = null

  var pickerEnabled = true
    set(value) {
      if (field == value) return
      field = value
      if (!value) cancelPicking(true)
    }
  var itemHeightDp = 44f
    set(value) {
      if (field == value) return
      cancelPicking(true)
      field = value
      dirty = true
      pendingSelection = true
      requestLayout()
    }
  private val itemHeightPx get() = max(1, PixelUtil.toPixelFromDIP(itemHeightDp).roundToInt())

  private val layoutManager = object : LinearLayoutManager(reactContext, RecyclerView.VERTICAL, false) {
    override fun calculateExtraLayoutSpace(state: RecyclerView.State, extraLayoutSpace: IntArray) {
      // Projected rows outside the flat viewport can still be visible on the
      // cylinder. Keep those hosts attached without recycling React content.
      // Padding leaves one central row in the layout viewport. The visible
      // cylinder extends radius * PI / 2 from its center on either side.
      val radius = max(itemHeightPx, this@NitroPickerColumn.height / 2)
      val extra = (radius * PI / 2).roundToInt()
      extraLayoutSpace[0] = extra
      extraLayoutSpace[1] = extra
    }
  }
  private val recycler = object : RecyclerView(reactContext) {
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
      if (event.actionMasked == MotionEvent.ACTION_DOWN) {
        touching = true
        ignoreTouch = false
        // Claim the gesture before the outer ScrollView intercepts the first
        // MOVE; waiting for RecyclerView's DRAGGING state is already too late.
        if (pickerEnabled && reactChildren.isNotEmpty()) {
          parent?.requestDisallowInterceptTouchEvent(true)
        }
      }
      currentTouch = event
      val handled = try {
        if (ignoreTouch) true else super.dispatchTouchEvent(event)
      } finally { currentTouch = null }
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
        touching = false
        ignoreTouch = false
        parent?.requestDisallowInterceptTouchEvent(false)
        if (nativeGesture) {
          nativeGesture = false
          NativeGestureUtil.notifyNativeGestureEnded(this, event)
        }
        if (event.actionMasked == MotionEvent.ACTION_CANCEL) cancelPicking(true)
      }
      return handled
    }
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean = pickerEnabled && super.onInterceptTouchEvent(event)
    override fun onTouchEvent(event: MotionEvent): Boolean = pickerEnabled && super.onTouchEvent(event)
    override fun onGenericMotionEvent(event: MotionEvent): Boolean = pickerEnabled && super.onGenericMotionEvent(event)
  }
  private val snap = object : LinearSnapHelper() {
    override fun findSnapView(manager: RecyclerView.LayoutManager): View? =
      if (cancelling) null else super.findSnapView(manager)
  }
  private val adapter = object : RecyclerView.Adapter<RowHolder>() {
    init { setHasStableIds(true) }
    override fun getItemCount() = reactChildren.size
    override fun getItemId(position: Int) = reactChildren[position].id.toLong()
    // A React host never becomes the host for a different option.
    override fun getItemViewType(position: Int) = reactChildren[position].id
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = RowHolder(RowSlot())
    override fun onBindViewHolder(holder: RowHolder, position: Int) {
      val slot = holder.itemView as RowSlot
      val child = reactChildren[position]
      if (child.parent !== slot) {
        slot.removeAllViews()
        (child.parent as? ViewGroup)?.removeView(child)
        slot.addView(child)
      }
      slot.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, itemHeightPx)
    }
    override fun onViewRecycled(holder: RowHolder) { (holder.itemView as RowSlot).removeAllViews() }
  }
  private val layoutWork = Runnable {
    layoutQueued = false
    if (!released && width > 0 && height > 0) {
      measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
      layout(left, top, right, bottom)
      layoutRows()
    }
  }

  init {
    clipChildren = false
    clipToPadding = false
    recycler.clipChildren = false
    recycler.clipToPadding = false
    recycler.overScrollMode = OVER_SCROLL_NEVER
    recycler.isNestedScrollingEnabled = false
    recycler.itemAnimator = null
    recycler.layoutManager = layoutManager
    recycler.adapter = adapter
    // RecyclerView exposes item accessibility itself. The Fabric container is
    // the sole adjustable accessibility element and owns its actions.
    recycler.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    super.addView(recycler)
    snap.attachToRecyclerView(recycler)
    recycler.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrolled(view: RecyclerView, dx: Int, dy: Int) { emitScroll() }
      override fun onScrollStateChanged(view: RecyclerView, state: Int) {
        if (state == RecyclerView.SCROLL_STATE_DRAGGING && !picking) {
          picking = true
          parent?.requestDisallowInterceptTouchEvent(true)
          currentTouch?.let {
            if (!nativeGesture) {
              nativeGesture = true
              NativeGestureUtil.notifyNativeGestureStarted(recycler, it)
            }
          }
          PickerRegistry.find(controllerId)?.started(revision)
        }
        if (state == RecyclerView.SCROLL_STATE_IDLE && view.scrollState == state && picking) {
          val item = snap.findSnapView(layoutManager) ?: return
          val distance = snap.calculateDistanceToFinalSnap(layoutManager, item) ?: return
          if (distance[1] != 0) return // SnapHelper has another system scroll pending.
          picking = false
          parent?.requestDisallowInterceptTouchEvent(false)
          emitScroll()
          PickerRegistry.find(controllerId)?.ended(selectedIndex(), revision, false)
        }
      }
    })
    ready = true
  }

  private inner class RowSlot : FrameLayout(reactContext) {
    init { clipChildren = false; clipToPadding = false }
    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
      val rowWidth = MeasureSpec.getSize(widthSpec)
      setMeasuredDimension(rowWidth, itemHeightPx)
      if (childCount > 0) getChildAt(0).measure(
        MeasureSpec.makeMeasureSpec(rowWidth, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(itemHeightPx, MeasureSpec.EXACTLY)
      )
    }
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
      if (childCount > 0) getChildAt(0).layout(0, 0, right - left, itemHeightPx)
    }
  }
  private class RowHolder(slot: FrameLayout) : RecyclerView.ViewHolder(slot)

  fun mount(child: View, index: Int) {
    cancelPicking(true)
    reactChildren.add(index, child)
    dirty = true
    pendingSelection = true
    requestLayout()
  }
  fun unmount(index: Int) {
    cancelPicking(true)
    val child = reactChildren.removeAt(index)
    (child.parent as? ViewGroup)?.removeView(child)
    dirty = true
    pendingSelection = true
    requestLayout()
  }
  fun bindController(id: String) {
    if (id == controllerId) return
    cancelPicking(true)
    PickerRegistry.find(controllerId)?.unbind(this)
    controllerId = id
    PickerRegistry.find(id)?.bind(this)
  }
  override fun applySelection(index: Int, revision: Double) {
    if (released || (picking && requestedIndex == index && this.revision == revision)) return
    cancelPicking(true)
    requestedIndex = index
    this.revision = revision
    pendingSelection = true
    requestLayout()
  }
  override fun cancelPicking(notify: Boolean) {
    val wasPicking = picking
    picking = false
    if (touching) ignoreTouch = true
    // stopScroll dispatches IDLE synchronously. Prevent SnapHelper from
    // starting a fresh snap while a controlled update is cancelling one.
    cancelling = true
    try { recycler.stopScroll() } finally { cancelling = false }
    parent?.requestDisallowInterceptTouchEvent(false)
    if (wasPicking && notify) PickerRegistry.find(controllerId)?.ended(selectedIndex(), revision, true)
  }
  fun commit() { requestLayout() }

  override fun requestLayout() {
    super.requestLayout()
    // React Native's root has already laid out this native container. Schedule
    // one layout pass for RecyclerView, never a timer or animation loop.
    if (ready && !layoutQueued && !released) {
      layoutQueued = true
      post(layoutWork)
    }
  }
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    if (changed) {
      cancelPicking(true)
      pendingSelection = true
    }
    layoutRows()
  }
  private fun layoutRows() {
    if (released || recycler.isComputingLayout || width <= 0 || height <= 0) return
    // Signed padding keeps the row and SnapHelper centered even when the
    // physical viewport is shorter than a row. Preserve the pixel remainder.
    val padding = height / 2 - itemHeightPx / 2
    val bottomPadding = height - padding - itemHeightPx
    if (recycler.paddingTop != padding || recycler.paddingBottom != bottomPadding) {
      recycler.setPadding(0, padding, 0, bottomPadding)
    }
    if (dirty) {
      dirty = false
      adapter.notifyDataSetChanged()
    }
    if (pendingSelection) {
      pendingSelection = false
      if (reactChildren.isNotEmpty()) {
        layoutManager.scrollToPositionWithOffset(requestedIndex.coerceIn(0, reactChildren.lastIndex), 0)
      }
    }
    recycler.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    recycler.layout(0, 0, width, height)
    emitScroll()
  }
  private fun offsetPx(): Int {
    val position = layoutManager.findFirstVisibleItemPosition()
    if (position == RecyclerView.NO_POSITION) return 0
    val item = layoutManager.findViewByPosition(position) ?: return 0
    return position * itemHeightPx - (layoutManager.getDecoratedTop(item) - recycler.paddingTop)
  }
  private fun selectedIndex(): Int = if (reactChildren.isEmpty()) -1 else
    (offsetPx().toDouble() / itemHeightPx).roundToInt().coerceIn(0, reactChildren.lastIndex)

  private fun emitScroll() {
    if (released || id == View.NO_ID) return
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      PickerScrollEvent(
        UIManagerHelper.getSurfaceId(this), id,
        offsetPx().toDouble() / itemHeightPx * itemHeightDp,
        PixelUtil.toDIPFromPixel(height.toFloat()).toDouble()
      )
    )
  }
  fun release() {
    released = true
    removeCallbacks(layoutWork)
    cancelPicking(false)
    PickerRegistry.find(controllerId)?.unbind(this)
    controllerId = ""
    snap.attachToRecyclerView(null)
    recycler.adapter = null
    reactChildren.forEach { (it.parent as? ViewGroup)?.removeView(it) }
    reactChildren.clear()
  }
}
