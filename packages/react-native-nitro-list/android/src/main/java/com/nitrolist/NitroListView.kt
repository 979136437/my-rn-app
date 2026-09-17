package com.nitrolist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Rect
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSmoothScroller
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.StaggeredGridLayoutManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.facebook.react.uimanager.events.NativeGestureUtil
import com.facebook.react.views.view.ReactViewGroup
import com.viewability.core.ViewabilityIdentity
import com.viewability.core.ViewabilityTracker
import com.viewability.core.VisibilitySample
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

internal data class Entry(val key: String, val type: String, val version: Double, val fullSpan: Boolean)
internal data class Configuration(
  val masonry: Boolean = false,
  val columns: Int = 1,
  val gap: Double = 0.0,
  val estimate: Double = 160.0,
  val refreshEnabled: Boolean = false,
  val headerHeight: Double = 64.0,
  val threshold: Double = 64.0,
  val paddingTop: Double = 0.0,
  val paddingRight: Double = 0.0,
  val paddingBottom: Double = 0.0,
  val paddingLeft: Double = 0.0,
  val endReachedEnabled: Boolean = false,
  val endReachedThreshold: Double = 0.5,
  val endReachedEpoch: Double = 0.0,
  val scrollEventsEnabled: Boolean = false,
  val scrollEventThrottle: Double = 16.0,
  val viewabilityEnabled: Boolean = false,
  val itemVisiblePercentThreshold: Double = 50.0,
  val minimumViewTime: Double = 0.0,
  val waitForInteraction: Boolean = false,
  val viewabilityEpoch: Double = 0.0,
)
internal data class Binding(
  val slotId: String,
  val key: String,
  val index: Int,
  val type: String,
  val token: Double,
  val version: Double,
  val active: Boolean,
)
private data class SizeKey(val key: String, val version: Double, val width: Int)
private data class Anchor(val key: String, val oldIndex: Int, val offset: Int, val priorEntries: List<Entry>, val atStart: Boolean)

/**
 * Fabric owns the ordered logical children and every React subtree. RecyclerView owns only its
 * private holders. Manager child APIs never expose RecyclerView's physical children to Fabric.
 * All state changes, including Nitro calls, are serialized on Android's UI thread.
 */
class NitroListView(private val reactContext: ThemedReactContext) : ReactViewGroup(reactContext) {
  internal val logicalChildren = mutableListOf<View>()
  private val slots = linkedMapOf<String, Binding>()
  private val slotViews = mutableMapOf<String, NitroListSlotView>()
  private val holders = mutableMapOf<String, Cell>()
  private val measuredTokens = mutableMapOf<String, Double>()
  private val heights = object : LinkedHashMap<SizeKey, Int>(128, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<SizeKey, Int>): Boolean = size > 4096
  }
  private val stableIds = mutableMapOf<String, Long>()
  private val viewTypes = mutableMapOf<String, Int>()
  private var nextStableId = 0L
  private var nextSlotId = 0L
  private var nextToken = 0L
  private var nextViewType = 0
  private var entries: List<Entry> = emptyList()
  private var positionsByKey: Map<String, Int> = emptyMap()
  private var configuration = Configuration()
  private var listId = ""
  private var initialized = false
  private var destroyed = false
  private var snapshotScheduled = false
  private var relayoutScheduled = false
  private var createdCells = 0
  private var rebinds = 0
  private var scrollGeneration = 0L
  private var pendingEndGeneration: Long? = null
  private var endAlignmentScheduled = false
  private var endCheckScheduled = false
  private var endReachedLatched = false
  private var pendingEndReachedRequest: Double? = null
  private var userScrolling = false
  private var estimatedStarts: IntArray? = null
  private var estimatedContentEnd = 0
  private var dataKeys: List<String> = emptyList()
  private var observationFrameScheduled = false
  private var scrollDeliveryScheduled = false
  private var lastScrollDelivery = -1L
  private var observedScrollState = "idle"
  private var previousScrollState = "idle"
  private var interacted = false
  private val viewabilityTracker = ViewabilityTracker()
  private var publishedVisible: List<ViewabilityIdentity>? = null
  internal var onSnapshot: ((List<Binding>, Int, Int) -> Unit)? = null
  private val adapter = ListAdapter()
  private val recycler = TouchRecyclerView()
  private var header: View? = null
  private var refreshing = false
  private var awaitingRefresh = false
  private var refreshSequence = 0
  private var refreshState = "idle"
  private var pullDistance = 0f
  private var downX = 0f
  private var downY = 0f
  private var dragging = false
  private var pullEligible = false
  private var animator: ValueAnimator? = null
  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private val ackTimeout = Runnable {
    if (awaitingRefresh && !refreshing) {
      awaitingRefresh = false
      settleTo(0f)
      scheduleEndCheck()
    }
  }
  private val publishSnapshot = Runnable {
    snapshotScheduled = false
    if (!destroyed) onSnapshot?.invoke(slots.values.toList(), createdCells, rebinds)
  }
  private val relayout = Runnable {
    relayoutScheduled = false
    if (!destroyed && width > 0 && height > 0) {
      forceLayout()
      measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
      layout(left, top, right, bottom)
    }
  }
  private val alignEnd = Runnable {
    endAlignmentScheduled = false
    alignMeasuredEnd()
  }
  private val checkEnd = Runnable {
    endCheckScheduled = false
    checkEndReached()
  }
  private val observeItems = Runnable {
    observationFrameScheduled = false
    updateViewability()
  }
  private val deliverScroll = Runnable {
    scrollDeliveryScheduled = false
    if (!destroyed && isAttachedToWindow && isShown && windowVisibility == VISIBLE && configuration.scrollEventsEnabled) {
      lastScrollDelivery = SystemClock.uptimeMillis()
      emit("topListScroll", scrollPayload())
    }
  }

  init {
    clipChildren = true
    // This manager extends ViewGroupManager, which does not apply ReactViewManager's
    // overflow prop. Clip the translated header and recycler in native drawing too.
    overflow = "hidden"
    recycler.layoutManager = LinearLayoutManager(context)
    recycler.adapter = adapter
    recycler.itemAnimator = null
    recycler.setItemViewCacheSize(0)
    recycler.setRecycledViewPool(object : RecyclerView.RecycledViewPool() {
      override fun clear() {
        super.clear()
        slots.values.filter { !it.active }.map { it.slotId }.forEach(::releaseSlot)
      }
      override fun putRecycledView(holder: RecyclerView.ViewHolder) {
        if (getRecycledViewCount(holder.itemViewType) >= MAX_IDLE_PER_TYPE ||
          viewTypes.values.sumOf { getRecycledViewCount(it) } >= MAX_IDLE_TOTAL) {
          (holder as? Cell)?.let { releaseSlot(it.slotId) }
          return
        }
        super.putRecycledView(holder)
      }
    })
    recycler.isNestedScrollingEnabled = false
    recycler.overScrollMode = OVER_SCROLL_NEVER
    recycler.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrolled(view: RecyclerView, dx: Int, dy: Int) {
        scheduleScrollDelivery()
        syncSlotPositions()
        scheduleEndAlignment()
        // Re-arm only on actual upward user movement, never on a footer resize
        // or a layout-only onScrolled(0, 0) notification.
        if (userScrolling && dy < 0) {
          val viewport = recycler.height - recycler.paddingTop - recycler.paddingBottom
          if (viewport > 0 && endDistance()?.let { it > viewport * configuration.endReachedThreshold } == true) {
            resetEndReached()
          }
        }
        scheduleEndCheck()
      }
      override fun onScrollStateChanged(view: RecyclerView, newState: Int) {
        if (newState == RecyclerView.SCROLL_STATE_DRAGGING) interacted = true
        val state = when (newState) {
          RecyclerView.SCROLL_STATE_DRAGGING -> "dragging"
          RecyclerView.SCROLL_STATE_SETTLING -> "settling"
          else -> "idle"
        }
        if (state != observedScrollState) {
          previousScrollState = observedScrollState
          observedScrollState = state
          if (configuration.scrollEventsEnabled && isShown && windowVisibility == VISIBLE) emit("topListScrollStateChange", scrollPayload())
        }
        if (newState == RecyclerView.SCROLL_STATE_DRAGGING) userScrolling = true
        if (newState == RecyclerView.SCROLL_STATE_IDLE) userScrolling = false
        if (newState == RecyclerView.SCROLL_STATE_IDLE) scheduleEndAlignment()
        scheduleEndCheck()
      }
    })
    recycler.addItemDecoration(object : RecyclerView.ItemDecoration() {
      override fun getItemOffsets(out: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
        if (entries.getOrNull(parent.getChildAdapterPosition(view))?.fullSpan == true ||
          (view.layoutParams as? StaggeredGridLayoutManager.LayoutParams)?.isFullSpan == true) {
          out.set(0, 0, 0, 0)
          return
        }
        val gap = px(configuration.gap)
        val columns = columns()
        val span = (view.layoutParams as? StaggeredGridLayoutManager.LayoutParams)?.spanIndex?.coerceAtLeast(0) ?: 0
        out.set(span * gap / columns, 0, gap - (span + 1) * gap / columns, gap)
      }
    })
    super.addView(recycler, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    initialized = true
  }

  internal fun updateListId(value: String) {
    if (listId == value) return
    NitroListRegistry.unregister(listId, this)
    listId = value
    if (!destroyed) NitroListRegistry.register(value, this)
  }

  internal fun configure(value: Configuration) {
    val previous = configuration
    val anchor = captureAnchor()
    configuration = value
    if (!value.scrollEventsEnabled) {
      removeCallbacks(deliverScroll)
      scrollDeliveryScheduled = false
      lastScrollDelivery = -1L
    } else if (!previous.scrollEventsEnabled || previous.scrollEventThrottle != value.scrollEventThrottle) {
      removeCallbacks(deliverScroll)
      scrollDeliveryScheduled = false
      scheduleScrollDelivery()
    }
    if (previous.viewabilityEnabled != value.viewabilityEnabled ||
      previous.itemVisiblePercentThreshold != value.itemVisiblePercentThreshold ||
      previous.minimumViewTime != value.minimumViewTime || previous.waitForInteraction != value.waitForInteraction) {
      viewabilityTracker.reset()
      publishedVisible = null
    }
    viewabilityTracker.configure(value.itemVisiblePercentThreshold, value.minimumViewTime, value.waitForInteraction)
    if (previous.viewabilityEpoch != value.viewabilityEpoch) publishedVisible = null
    if (!value.viewabilityEnabled) {
      removeCallbacks(observeItems)
      observationFrameScheduled = false
    }
    if (previous.estimate != value.estimate) estimatedStarts = null
    recycler.setPadding(px(value.paddingLeft), px(value.paddingTop), px(value.paddingRight), px(value.paddingBottom))
    if (previous.masonry != value.masonry || previous.columns != value.columns) {
      recycler.layoutManager = if (value.masonry) {
        StaggeredGridLayoutManager(columns(), RecyclerView.VERTICAL).apply {
          gapStrategy = StaggeredGridLayoutManager.GAP_HANDLING_MOVE_ITEMS_BETWEEN_SPANS
        }
      } else LinearLayoutManager(context)
    }
    val geometryChanged = previous.gap != value.gap || previous.columns != value.columns ||
      previous.masonry != value.masonry || previous.paddingLeft != value.paddingLeft ||
      previous.paddingRight != value.paddingRight || previous.paddingTop != value.paddingTop ||
      previous.paddingBottom != value.paddingBottom
    if (geometryChanged) {
      estimatedStarts = null
      if (previous.gap != value.gap || previous.columns != value.columns || previous.masonry != value.masonry ||
        previous.paddingLeft != value.paddingLeft || previous.paddingRight != value.paddingRight) {
        heights.clear()
        measuredTokens.clear()
      }
      recycler.invalidateItemDecorations()
      adapter.notifyDataSetChanged()
      restoreAnchor(anchor)
      requestLayout()
    }
    if (!value.refreshEnabled && !refreshing) {
      pullEligible = false
      awaitingRefresh = false
      removeCallbacks(ackTimeout)
      settleTo(0f)
    } else if (refreshing) settleTo(px(value.headerHeight).toFloat())
    if (previous.headerHeight != value.headerHeight) requestLayout()
    scheduleEndCheck()
  }

  internal fun setItems(value: List<Entry>) {
    if (entries == value) return
    estimatedStarts = null
    val nextDataKeys = value.filterNot { it.fullSpan }.map { it.key }
    if (dataKeys != nextDataKeys) {
      // Only a new data batch resets the latch; auxiliary and content revisions do not.
      resetEndReached()
      dataKeys = nextDataKeys
    }
    scrollGeneration++
    val contentOnly = entries.size == value.size && entries.indices.all {
      entries[it].key == value[it].key && entries[it].type == value[it].type && entries[it].fullSpan == value[it].fullSpan
    }
    val anchor = if (contentOnly) null else captureAnchor()
    entries = value
    positionsByKey = value.mapIndexed { index, entry -> entry.key to index }.toMap()
    val keys = value.mapTo(hashSetOf()) { it.key }
    stableIds.keys.retainAll(keys)
    for (item in value) stableIds.getOrPut(item.key) { nextStableId++ }
    val versions = value.associate { it.key to it.version }
    heights.keys.removeAll { versions[it.key] != it.version }
    if (contentOnly) {
      // A content revision is not a recycled identity. Keep mounted cells and their
      // current geometry visible while React commits and measures the new version.
      for ((id, binding) in slots.toMap()) {
        val position = positionsByKey[binding.key] ?: continue
        val item = value[position]
        if (binding.active && binding.type == item.type) {
          slots[id] = binding.copy(index = position, version = item.version)
        }
      }
    } else {
      (recycler.layoutManager as? StaggeredGridLayoutManager)?.invalidateSpanAssignments()
      adapter.notifyDataSetChanged()
      restoreAnchor(anchor)
    }
    scheduleSnapshot()
    scheduleEndCheck()
  }

  internal fun setRefreshing(value: Boolean) {
    if (value && !refreshing) resetEndReached()
    refreshing = value
    awaitingRefresh = false
    removeCallbacks(ackTimeout)
    if (value) {
      // Keep consuming an intercepted gesture until UP/CANCEL, but it can no
      // longer overwrite or request the externally controlled refresh.
      pullEligible = false
      setRefreshState("refreshing")
      settleTo(px(configuration.headerHeight).toFloat())
    } else if (pullDistance > 0f || refreshState != "idle") settleTo(0f)
    scheduleEndCheck()
  }

  internal fun addLogicalChild(child: View, index: Int) {
    logicalChildren.add(index, child)
    if (child is NitroListSlotView) {
      slotViews[child.slotId] = child
      attachSlot(child.slotId)
    } else {
      check(header == null) { "NitroListView accepts only one refresh header" }
      header = child
      (child.parent as? ViewGroup)?.removeView(child)
      super.addView(child, 0)
      child.translationY = pullDistance - px(configuration.headerHeight)
      child.visibility = if (pullDistance > 0f) VISIBLE else INVISIBLE
    }
    requestLayout()
  }

  internal fun removeLogicalChild(index: Int) {
    val child = logicalChildren.removeAt(index)
    if (child is NitroListSlotView && slotViews[child.slotId] === child) slotViews.remove(child.slotId)
    if (header === child) header = null
    (child.parent as? ViewGroup)?.removeView(child)
  }

  internal fun removeAllLogicalChildren() {
    while (logicalChildren.isNotEmpty()) removeLogicalChild(logicalChildren.lastIndex)
  }

  internal fun slotDidCommit(view: NitroListSlotView) {
    // addView can occur after the props transaction. Never parent a child before Fabric inserts it.
    if (view !in logicalChildren) return
    slotViews.entries.removeAll { it.value === view && it.key != view.slotId }
    slotViews[view.slotId] = view
    attachSlot(view.slotId)
    scheduleEndAlignment()
    scheduleEndCheck()
  }

  private fun attachSlot(id: String) {
    val binding = slots[id] ?: return
    val holder = holders[id] ?: return
    val view = slotViews[id] ?: return
    if (view.parent !== holder.frame) {
      (view.parent as? ViewGroup)?.removeView(view)
      holder.frame.addView(view, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }
    // Tokens identify the item occupying a slot. Same-item content revisions keep
    // the last committed content visible; a different item always gets a new token.
    holder.frame.visibility = if (binding.active && view.bindingToken == binding.token &&
      measuredTokens[id] == binding.token) VISIBLE else INVISIBLE
    syncSlotPosition(view)
  }

  internal fun syncSlotPosition(view: NitroListSlotView) {
    val binding = slots[view.slotId] ?: return
    val frame = holders[view.slotId]?.frame ?: return
    if (!binding.active || frame.parent !== recycler || view.parent !== frame) return
    // Fabric sees slots as direct children at (0, 0). Publish the native position
    // as Fabric state so descendant measure()/Pressability use screen-correct bounds.
    view.updateContentOffset(
      dp(recycler.x + frame.x + view.left - recycler.scrollX - frame.scrollX),
      dp(recycler.y + frame.y + view.top - recycler.scrollY - frame.scrollY),
    )
  }

  private fun syncSlotPositions() {
    for (view in slotViews.values) syncSlotPosition(view)
  }

  internal fun reportMeasurement(id: String, token: Double, version: Double, widthDp: Double, heightDp: Double) {
    val binding = slots[id] ?: return
    if (!binding.active || binding.token != token || binding.version != version || !widthDp.isFinite() ||
      !heightDp.isFinite() || widthDp <= 0 || heightDp < 0) return
    val item = entries.getOrNull(binding.index) ?: return
    if (item.key != binding.key) return
    val expectedWidth = contentWidth(item)
    if (abs(px(widthDp) - expectedWidth) > 2) return
    val measured = max(1, px(heightDp))
    val sizeKey = SizeKey(binding.key, version, expectedWidth)
    if (heights[sizeKey] != measured) {
      estimatedStarts = null
    }
    measuredTokens[id] = token
    heights[sizeKey] = measured
    holders[id]?.frame?.let { frame ->
      val params = frame.layoutParams
      val layoutHeight = cellLayoutHeight(measured, item.fullSpan)
      if (params != null && params.height != layoutHeight) {
        // StaggeredGridLayoutManager preserves each span's reference line itself.
        // Repeatedly scrolling to a single cell shifts the other columns' starts.
        val anchor = if (configuration.masonry) null else captureAnchor()
        params.height = layoutHeight
        frame.layoutParams = params
        restoreAnchor(anchor)
        requestLayout()
      }
    }
    attachSlot(id)
    scheduleEndAlignment()
    scheduleEndCheck()
  }

  internal fun scrollToOffset(offset: Double, animated: Boolean) {
    scrollGeneration++
    userScrolling = false
    estimatedStarts = null
    recycler.stopScroll()
    if (entries.isEmpty()) return
    // RecyclerView's computeVerticalScrollOffset is an estimate for variable-height rows.
    // Walk the same known/estimated heights to resolve a pixel offset to an adapter position.
    val target = max(0, px(offset))
    val columnHeights = IntArray(columns())
    var position = 0
    var rowStart = 0
    for (index in entries.indices) {
      val column = columnHeights.indices.minByOrNull { columnHeights[it] } ?: 0
      val item = entries[index]
      val start = if (item.fullSpan) columnHeights.maxOrNull() ?: 0 else columnHeights[column]
      // Keep the first item when multiple spans start at the same offset, in
      // particular offset zero must target item 0 rather than the last column.
      if (start <= target && (index == 0 || start > rowStart)) { position = index; rowStart = start }
      val end = start + itemHeight(item) + if (item.fullSpan) 0 else px(configuration.gap)
      if (item.fullSpan) columnHeights.fill(end) else columnHeights[column] = end
      if (columnHeights.all { it > target }) break
    }
    if (animated) {
      val targetOffset = rowStart - target
      recycler.layoutManager?.startSmoothScroll(object : LinearSmoothScroller(context) {
        override fun getVerticalSnapPreference(): Int = SNAP_TO_START
        override fun calculateDyToMakeVisible(view: View, snapPreference: Int): Int =
          super.calculateDyToMakeVisible(view, snapPreference) + targetOffset
      }.apply { targetPosition = position })
    } else {
      scrollPosition(position, rowStart - target)
      requestLayout()
    }
  }

  internal fun scrollToEnd(animated: Boolean) {
    val generation = ++scrollGeneration
    userScrolling = false
    estimatedStarts = null
    recycler.stopScroll()
    if (entries.isEmpty()) return
    pendingEndGeneration = generation
    if (animated) {
      recycler.layoutManager?.startSmoothScroll(object : LinearSmoothScroller(context) {
        override fun getVerticalSnapPreference(): Int = SNAP_TO_END
        override fun onStop() { super.onStop(); scheduleEndAlignment() }
      }.apply { targetPosition = entries.lastIndex })
    } else {
      recycler.scrollToPosition(entries.lastIndex)
      requestLayout()
      scheduleEndAlignment()
    }
  }

  private fun scheduleEndAlignment() {
    if (pendingEndGeneration == null || endAlignmentScheduled || destroyed) return
    endAlignmentScheduled = true
    postOnAnimation(alignEnd)
  }

  private fun scheduleEndCheck() {
    scheduleObservation()
    if (endCheckScheduled || destroyed) return
    endCheckScheduled = true
    postOnAnimation(checkEnd)
  }

  private fun scheduleScrollDelivery() {
    if (destroyed || !isAttachedToWindow || !isShown || windowVisibility != VISIBLE ||
      !configuration.scrollEventsEnabled || scrollDeliveryScheduled) return
    val now = SystemClock.uptimeMillis()
    val interval = configuration.scrollEventThrottle.toLong()
    val delay = if (lastScrollDelivery < 0) 0L else (interval - (now - lastScrollDelivery)).coerceAtLeast(0L)
    scrollDeliveryScheduled = true
    if (delay == 0L) postOnAnimation(deliverScroll)
    else postOnAnimationDelayed(deliverScroll, minOf(delay, Long.MAX_VALUE - now))
  }

  private fun scrollPayload(): WritableMap {
    val starts = estimatedItemStarts()
    val manager = recycler.layoutManager
    var anchor: View? = null
    var position = Int.MAX_VALUE
    for (index in 0 until recycler.childCount) {
      val child = recycler.getChildAt(index)
      val candidate = recycler.getChildAdapterPosition(child)
      if (candidate in entries.indices && candidate < position) { position = candidate; anchor = child }
    }
    val offset = if (anchor != null && manager != null) {
      max(0, starts[position] - manager.getDecoratedTop(anchor) + recycler.paddingTop)
    } else 0
    val contentHeight = max(0, estimatedContentEnd + recycler.paddingTop + recycler.paddingBottom)
    return Arguments.createMap().apply {
      putDouble("offsetY", dp(offset.toFloat()))
      putDouble("viewportWidth", dp(recycler.width.toFloat()))
      putDouble("viewportHeight", dp(recycler.height.toFloat()))
      putDouble("contentHeight", dp(contentHeight.toFloat()))
      putString("state", observedScrollState)
      putString("previousState", previousScrollState)
      putDouble("timestamp", SystemClock.uptimeMillis().toDouble())
    }
  }

  private fun scheduleObservation() {
    if (destroyed || !configuration.viewabilityEnabled || !isAttachedToWindow || observationFrameScheduled) return
    // Replace a pending dwell deadline with a next-frame geometry check.
    removeCallbacks(observeItems)
    observationFrameScheduled = true
    postOnAnimation(observeItems)
  }

  private fun updateViewability() {
    if (destroyed || !isAttachedToWindow || !configuration.viewabilityEnabled) return
    if (!isShown || windowVisibility != VISIBLE) {
      viewabilityTracker.reset()
      publishViewableItems(emptyList())
      return
    }
    if (recycler.isComputingLayout || recycler.isLayoutRequested) return
    val now = SystemClock.uptimeMillis()
    val samples = mutableListOf<VisibilitySample>()
    val top = max(0f, recycler.y + recycler.paddingTop)
    val bottom = minOf(height.toFloat(), recycler.y + recycler.height - recycler.paddingBottom)
    val left = max(0f, recycler.x + recycler.paddingLeft)
    val right = minOf(width.toFloat(), recycler.x + recycler.width - recycler.paddingRight)
    if (bottom > top && right > left) {
      for (index in 0 until recycler.childCount) {
        val frame = recycler.getChildAt(index)
        val cell = recycler.getChildViewHolder(frame) as? Cell ?: continue
        val binding = slots[cell.slotId] ?: continue
        val slot = slotViews[cell.slotId] ?: continue
        val item = entries.getOrNull(binding.index) ?: continue
        if (item.fullSpan || item.key != binding.key || item.version != binding.version || !binding.active ||
          !frame.isShown || frame.height <= 0 || slot.parent !== frame ||
          measuredTokens[cell.slotId] != binding.token || slot.bindingToken != binding.token ||
          slot.itemVersion != item.version || !heights.containsKey(SizeKey(item.key, item.version, contentWidth(item)))) continue
        val itemTop = recycler.y + frame.y
        val itemBottom = itemTop + frame.height
        val overlap = minOf(bottom, itemBottom) - max(top, itemTop)
        if (overlap <= 0 || minOf(right, recycler.x + frame.x + frame.width) <= max(left, recycler.x + frame.x)) continue
        // List semantics remain visible height, while ordinary observers use area.
        samples.add(VisibilitySample(ViewabilityIdentity(item.key, item.version), overlap * 100.0 / frame.height))
      }
    }
    val result = viewabilityTracker.update(samples, now, interacted)
    publishViewableItems(result.visible.sortedBy { positionsByKey[it.key] })
    result.nextCheckDelayMs?.let {
      postDelayed(observeItems, minOf(it, Long.MAX_VALUE - now))
    }
  }

  private fun publishViewableItems(items: List<ViewabilityIdentity>) {
    if (publishedVisible != items) {
      publishedVisible = items
      emit("topViewableItemsChange", Arguments.createMap().apply {
        putDouble("epoch", configuration.viewabilityEpoch)
        putArray("items", Arguments.createArray().apply {
          items.forEach { item -> pushMap(Arguments.createMap().apply {
            putString("key", item.key)
            putDouble("version", item.version)
          }) }
        })
      })
    }
  }

  private fun resetEndReached() {
    endReachedLatched = false
    pendingEndReachedRequest = null
  }

  internal fun resolveEndReached(requestId: Double, accepted: Boolean) {
    // Old responses cannot unlock a newer data batch or a subsequent request.
    if (pendingEndReachedRequest != requestId) return
    pendingEndReachedRequest = null
    if (!accepted) {
      endReachedLatched = false
      scheduleEndCheck()
    }
  }

  private fun checkEndReached() {
    if (destroyed || !isAttachedToWindow || dataKeys.isEmpty()) return
    val viewport = recycler.height - recycler.paddingTop - recycler.paddingBottom
    if (viewport <= 0 || recycler.isComputingLayout || recycler.isLayoutRequested) return
    val threshold = viewport * configuration.endReachedThreshold
    if (!configuration.endReachedEnabled || refreshing || awaitingRefresh || endReachedLatched || recycler.childCount == 0) return
    for (index in 0 until recycler.childCount) {
      val cell = recycler.getChildViewHolder(recycler.getChildAt(index)) as? Cell ?: return
      val binding = slots[cell.slotId] ?: return
      val view = slotViews[cell.slotId] ?: return
      val item = entries.getOrNull(binding.index) ?: return
      if (!binding.active || item.key != binding.key || item.version != binding.version ||
        measuredTokens[cell.slotId] != binding.token || view.bindingToken != binding.token ||
        view.itemVersion != binding.version || !heights.containsKey(SizeKey(item.key, item.version, contentWidth(item)))) return
    }
    val distance = endDistance() ?: return
    if (distance > threshold) return
    endReachedLatched = true
    val requestId = (++nextEndReachedRequest).toDouble()
    pendingEndReachedRequest = requestId
    emit("topEndReached", Arguments.createMap().apply {
      putDouble("requestId", requestId)
      putInt("dataCount", dataKeys.size)
      putString("tailKey", dataKeys.last())
      putDouble("epoch", configuration.endReachedEpoch)
    })
  }

  private fun endDistance(): Int? {
    val manager = recycler.layoutManager ?: return null
    if (recycler.childCount == 0 || entries.isEmpty()) return null
    // The last position is not necessarily the deepest masonry column. When
    // the end is attached, use the real decorated bottom of every visible span.
    val deepest = (0 until recycler.childCount).maxOf { manager.getDecoratedBottom(recycler.getChildAt(it)) }
    val actual = deepest - recycler.height + recycler.paddingBottom
    if (recycler.findViewHolderForAdapterPosition(entries.lastIndex) != null) return actual
    // Far from the end, project unmounted rows using cached/estimated sizes.
    // Cache the walk so ordinary scroll frames only inspect attached children.
    val starts = estimatedItemStarts()
    var anchor: View? = null
    var position = Int.MAX_VALUE
    for (index in 0 until recycler.childCount) {
      val child = recycler.getChildAt(index)
      val candidate = recycler.getChildAdapterPosition(child)
      if (candidate in entries.indices && candidate < position) { anchor = child; position = candidate }
    }
    val view = anchor ?: return null
    return max(actual, estimatedContentEnd - starts[position] + manager.getDecoratedTop(view) - recycler.height + recycler.paddingBottom)
  }

  private fun estimatedItemStarts(): IntArray = estimatedStarts ?: IntArray(entries.size).also { result ->
    val spans = IntArray(columns())
    entries.forEachIndexed { index, item ->
      val column = spans.indices.minByOrNull { spans[it] } ?: 0
      val start = if (item.fullSpan) spans.maxOrNull() ?: 0 else spans[column]
      result[index] = start
      val end = start + itemHeight(item) + if (item.fullSpan) 0 else px(configuration.gap)
      if (item.fullSpan) spans.fill(end) else spans[column] = end
    }
    estimatedContentEnd = spans.maxOrNull() ?: 0
    estimatedStarts = result
  }

  private fun alignMeasuredEnd() {
    val generation = pendingEndGeneration ?: return
    if (destroyed || generation != scrollGeneration || entries.isEmpty()) {
      pendingEndGeneration = null
      return
    }
    val manager = recycler.layoutManager ?: return
    if (recycler.scrollState != RecyclerView.SCROLL_STATE_IDLE || manager.isSmoothScrolling ||
      recycler.isComputingLayout || recycler.isLayoutRequested || recycler.height == 0) return
    // Native holders exist before their React content is measured. Wait for all
    // attached cells, including the deepest masonry column, to commit this revision.
    for (index in 0 until recycler.childCount) {
      val cell = recycler.getChildViewHolder(recycler.getChildAt(index)) as? Cell ?: return
      val binding = slots[cell.slotId] ?: return
      val view = slotViews[cell.slotId] ?: return
      if (!binding.active || measuredTokens[cell.slotId] != binding.token ||
        view.bindingToken != binding.token || view.itemVersion != binding.version ||
        !heights.containsKey(SizeKey(binding.key, binding.version, contentWidth(entries.getOrNull(binding.index) ?: return)))) return
    }
    if (recycler.findViewHolderForAdapterPosition(entries.lastIndex) == null) {
      // Earlier tail cells can grow enough to evict the last holder. Once the
      // current window is measured, seek it again using the updated size cache.
      recycler.scrollToPosition(entries.lastIndex)
      requestLayout()
      return
    }
    val deepest = (0 until recycler.childCount).maxOfOrNull {
      manager.getDecoratedBottom(recycler.getChildAt(it))
    } ?: 0
    val remaining = max(0, deepest - recycler.height + recycler.paddingBottom)
    if (remaining > 0 && recycler.canScrollVertically(1)) {
      recycler.scrollBy(0, remaining)
      // Scrolling can attach more cells; their commits/measurements will wake us.
      scheduleEndAlignment()
    } else {
      pendingEndGeneration = null
    }
  }

  internal fun publishCurrentSnapshot() = scheduleSnapshot()

  private fun scheduleSnapshot() {
    if (!snapshotScheduled && !destroyed) {
      snapshotScheduled = true
      postOnAnimation(publishSnapshot)
    }
  }

  private fun captureAnchor(): Anchor? {
    var best: View? = null
    var bestPosition = Int.MAX_VALUE
    for (index in 0 until recycler.childCount) {
      val child = recycler.getChildAt(index)
      val position = recycler.getChildAdapterPosition(child)
      if (position in entries.indices && child.bottom > 0 && child.top < recycler.height && position < bestPosition) {
        best = child
        bestPosition = position
      }
    }
    return best?.let {
      Anchor(entries[bestPosition].key, bestPosition, it.top - recycler.paddingTop, entries,
        bestPosition == 0 && it.top >= recycler.paddingTop && !recycler.canScrollVertically(-1))
    }
  }

  private fun restoreAnchor(anchor: Anchor?) {
    if (anchor == null || entries.isEmpty()) return
    if (anchor.atStart) {
      // At the boundary, inserting/removing the first item must keep every span
      // at the start instead of anchoring the old first item in a different column.
      scrollPosition(0, 0)
      return
    }
    var position = positionsByKey[anchor.key]
    if (position == null) {
      for (distance in 1..anchor.priorEntries.size) {
        val next = anchor.priorEntries.getOrNull(anchor.oldIndex + distance)?.key?.let { positionsByKey[it] }
        val previous = anchor.priorEntries.getOrNull(anchor.oldIndex - distance)?.key?.let { positionsByKey[it] }
        position = next ?: previous
        if (position != null) break
      }
    }
    scrollPosition(position ?: 0, anchor.offset)
  }

  private fun scrollPosition(position: Int, offset: Int) {
    when (val manager = recycler.layoutManager) {
      is LinearLayoutManager -> manager.scrollToPositionWithOffset(position, offset)
      is StaggeredGridLayoutManager -> manager.scrollToPositionWithOffset(position, offset)
    }
  }

  private fun columns(): Int = if (configuration.masonry) configuration.columns.coerceAtLeast(1) else 1
  private fun contentWidth(item: Entry): Int {
    val available = width - recycler.paddingLeft - recycler.paddingRight
    return max(1, if (item.fullSpan) available else (available - (columns() - 1) * px(configuration.gap)) / columns())
  }
  private fun itemHeight(item: Entry): Int = heights[SizeKey(item.key, item.version, contentWidth(item))] ?: max(1, px(configuration.estimate))
  // StaggeredGridLayoutManager subtracts decorations even from an EXACT height.
  // LinearLayoutManager keeps an explicit height intact and adds decorations outside.
  private fun cellLayoutHeight(contentHeight: Int, fullSpan: Boolean): Int =
    contentHeight + if (configuration.masonry && !fullSpan) px(configuration.gap) else 0
  private fun px(dp: Double): Int = (dp * resources.displayMetrics.density).roundToInt()
  private fun dp(px: Float): Double = (px / resources.displayMetrics.density).toDouble()

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    recycler.measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY))
    header?.measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(px(configuration.headerHeight), MeasureSpec.EXACTLY))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    recycler.layout(0, 0, right - left, bottom - top)
    header?.layout(0, 0, right - left, px(configuration.headerHeight))
    // The configured header height may have changed while a pull is in progress.
    header?.translationY = pullDistance - px(configuration.headerHeight)
    header?.visibility = if (pullDistance > 0f) VISIBLE else INVISIBLE
    syncSlotPositions()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    estimatedStarts = null
    if (w != oldw) {
      heights.clear()
      measuredTokens.clear()
      holders.values.forEach { it.frame.visibility = INVISIBLE }
      recycler.post {
        if (!destroyed) {
          adapter.notifyDataSetChanged()
          requestLayout()
        }
      }
    }
  }

  override fun requestLayout() {
    super.requestLayout()
    // ReactViewGroup intentionally suppresses normal child-driven traversal. RecyclerView needs it.
    if (initialized && !relayoutScheduled && !destroyed) {
      relayoutScheduled = true
      postOnAnimation(relayout)
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (!destroyed) {
      NitroListRegistry.register(listId, this)
      requestLayout()
      scheduleScrollDelivery()
      scheduleObservation()
      post {
        if (!destroyed && isAttachedToWindow) {
          emit("topRefreshStateChange", Arguments.createMap().apply { putString("state", refreshState) })
          setPullDistance(pullDistance)
        }
      }
    }
  }

  override fun onVisibilityChanged(changedView: View, visibility: Int) {
    super.onVisibilityChanged(changedView, visibility)
    if (initialized && !destroyed) reconcileVisibility()
  }

  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (initialized && !destroyed) reconcileVisibility()
  }

  private fun reconcileVisibility() {
    if (!isShown || windowVisibility != VISIBLE) {
      removeCallbacks(observeItems)
      observationFrameScheduled = false
      removeCallbacks(deliverScroll)
      scrollDeliveryScheduled = false
      viewabilityTracker.reset()
      if (isAttachedToWindow && configuration.viewabilityEnabled) publishViewableItems(emptyList())
    } else {
      scheduleObservation()
      scheduleScrollDelivery()
    }
  }

  override fun onDetachedFromWindow() {
    // A retained screen may attach again without being disposed. Do not resume
    // an old end-alignment request when its delayed measurements finally arrive.
    scrollGeneration++
    pendingEndGeneration = null
    removeCallbacks(alignEnd)
    removeCallbacks(checkEnd)
    endCheckScheduled = false
    userScrolling = false
    estimatedStarts = null
    endAlignmentScheduled = false
    recycler.stopScroll()
    cancelAnimation()
    removeCallbacks(ackTimeout)
    dragging = false
    pullEligible = false
    if (!refreshing) {
      awaitingRefresh = false
      setPullDistance(0f)
      setRefreshState("idle")
    } else setPullDistance(px(configuration.headerHeight).toFloat())
    if (configuration.viewabilityEnabled) publishViewableItems(emptyList())
    super.onDetachedFromWindow()
    stopObserving()
  }

  internal fun dispose() {
    if (destroyed) return
    destroyed = true
    NitroListRegistry.unregister(listId, this)
    onSnapshot = null
    removeCallbacks(publishSnapshot)
    removeCallbacks(relayout)
    removeCallbacks(alignEnd)
    removeCallbacks(checkEnd)
    pendingEndGeneration = null
    removeCallbacks(ackTimeout)
    cancelAnimation()
    recycler.stopScroll()
    stopObserving()
    recycler.adapter = null
    recycler.recycledViewPool.clear()
    removeAllLogicalChildren()
    slots.clear()
    holders.clear()
    slotViews.clear()
    heights.clear()
    measuredTokens.clear()
  }

  private fun stopObserving() {
    removeCallbacks(observeItems)
    observationFrameScheduled = false
    removeCallbacks(deliverScroll)
    scrollDeliveryScheduled = false
    lastScrollDelivery = -1L
    viewabilityTracker.reset()
    publishedVisible = null
    observedScrollState = "idle"
    previousScrollState = "idle"
  }

  private class CellFrame(context: ThemedReactContext) : FrameLayout(context), ReactPointerEventsView {
    // RN hit-testing does not filter Android INVISIBLE itself. Block stale subtrees explicitly.
    override val pointerEvents: PointerEvents
      get() = if (visibility == VISIBLE) PointerEvents.AUTO else PointerEvents.NONE
  }

  private inner class Cell(val frame: CellFrame, val type: String) : RecyclerView.ViewHolder(frame) {
    var slotId: String = ""
  }

  private inner class ListAdapter : RecyclerView.Adapter<Cell>() {
    init { setHasStableIds(true) }
    override fun getItemCount(): Int = entries.size
    override fun getItemId(position: Int): Long = stableIds.getValue(entries[position].key)
    override fun getItemViewType(position: Int): Int = viewTypes.getOrPut(entries[position].type) {
      val id = nextViewType++
      recycler.recycledViewPool.setMaxRecycledViews(id, MAX_IDLE_PER_TYPE)
      id
    }
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Cell {
      val frame = CellFrame(reactContext)
      val type = viewTypes.entries.first { it.value == viewType }.key
      val fullSpan = entries.firstOrNull { it.type == type }?.fullSpan == true
      frame.layoutParams = cellLayoutParams(px(configuration.estimate), fullSpan)
      frame.clipChildren = true
      createdCells++
      return Cell(frame, type)
    }
    override fun onBindViewHolder(holder: Cell, position: Int) {
      val item = entries[position]
      val old = slots[holder.slotId]
      val keepIdentity = old != null && old.active && old.key == item.key && old.type == item.type &&
        measuredTokens[holder.slotId] == old.token
      if (old == null) holder.slotId = "slot-${nextSlotId++}"
      else if (!keepIdentity) rebinds++
      holders[holder.slotId] = holder
      holder.frame.layoutParams = cellLayoutParams(
        if (keepIdentity) heights[SizeKey(item.key, item.version, contentWidth(item))]
          ?: holder.frame.height.coerceAtLeast(1) else itemHeight(item), item.fullSpan,
      )
      if (!keepIdentity) {
        holder.frame.visibility = INVISIBLE
        measuredTokens.remove(holder.slotId)
      }
      val token = if (keepIdentity) old!!.token else (++nextToken).toDouble()
      slots[holder.slotId] = Binding(holder.slotId, item.key, position, item.type, token, item.version, true)
      attachSlot(holder.slotId)
      scheduleSnapshot()
    }
    override fun onViewAttachedToWindow(holder: Cell) {
      super.onViewAttachedToWindow(holder)
      val binding = slots[holder.slotId] ?: return
      val item = entries.getOrNull(binding.index) ?: return
      (holder.frame.layoutParams as? StaggeredGridLayoutManager.LayoutParams)?.isFullSpan = item.fullSpan
      scheduleEndCheck()
    }
    override fun onViewRecycled(holder: Cell) {
      val binding = slots[holder.slotId]
      if (binding != null) slots[holder.slotId] = binding.copy(active = false)
      holder.frame.visibility = INVISIBLE
      measuredTokens.remove(holder.slotId)
      scheduleSnapshot()
    }
    override fun onViewDetachedFromWindow(holder: Cell) {
      super.onViewDetachedFromWindow(holder)
      // RecyclerView can detach and reattach unchanged cells within one layout.
      // Reconcile after that transaction so append does not restart their dwell.
      scheduleObservation()
    }
  }

  private fun cellLayoutParams(contentHeight: Int, fullSpan: Boolean): RecyclerView.LayoutParams =
    if (configuration.masonry) {
      StaggeredGridLayoutManager.LayoutParams(LayoutParams.MATCH_PARENT, cellLayoutHeight(contentHeight, fullSpan)).apply {
        isFullSpan = fullSpan
      }
    } else RecyclerView.LayoutParams(LayoutParams.MATCH_PARENT, contentHeight)

  private fun releaseSlot(slotId: String) {
    slotViews[slotId]?.let { (it.parent as? ViewGroup)?.removeView(it) }
    holders.remove(slotId)?.slotId = ""
    slots.remove(slotId)
    measuredTokens.remove(slotId)
    scheduleSnapshot()
  }

  private inner class TouchRecyclerView : RecyclerView(reactContext) {
    private var nativeGesture = false
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
      super.onLayout(changed, left, top, right, bottom)
      syncSlotPositions()
      scheduleEndAlignment()
      scheduleEndCheck()
      scheduleScrollDelivery()
    }
    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
      val intercepted = super.onInterceptTouchEvent(event)
      if (intercepted && !nativeGesture) {
        nativeGesture = true
        NativeGestureUtil.notifyNativeGestureStarted(this, event)
      }
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) endGesture(event)
      return intercepted
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
      val handled = super.onTouchEvent(event)
      if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) endGesture(event)
      return handled
    }
    private fun endGesture(event: MotionEvent) {
      if (nativeGesture) NativeGestureUtil.notifyNativeGestureEnded(this, event)
      nativeGesture = false
    }
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        scrollGeneration++
        downX = event.x
        downY = event.y
        dragging = false
        pullEligible = configuration.refreshEnabled && !refreshing && !awaitingRefresh && !recycler.canScrollVertically(-1)
      }
      MotionEvent.ACTION_MOVE -> {
        val dy = event.y - downY
        if (pullEligible && !recycler.canScrollVertically(-1) && dy > touchSlop && dy > abs(event.x - downX)) {
          cancelAnimation()
          dragging = true
          interacted = true
          scheduleObservation()
          parent?.requestDisallowInterceptTouchEvent(true)
          NativeGestureUtil.notifyNativeGestureStarted(this, event)
          return true
        }
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> if (!dragging) pullEligible = false
    }
    return dragging || super.onInterceptTouchEvent(event)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!dragging) return super.onTouchEvent(event)
    when (event.actionMasked) {
      MotionEvent.ACTION_MOVE -> {
        if (!pullEligible || refreshing || !configuration.refreshEnabled) return true
        setPullDistance(max(0f, (event.y - downY - touchSlop) * 0.5f))
        setRefreshState(if (pullDistance >= px(configuration.threshold)) "ready" else "pulling")
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        val canRefresh = pullEligible && configuration.refreshEnabled && !refreshing && !awaitingRefresh
        dragging = false
        pullEligible = false
        NativeGestureUtil.notifyNativeGestureEnded(this, event)
        parent?.requestDisallowInterceptTouchEvent(false)
        if (refreshing) {
          setRefreshState("refreshing")
          settleTo(px(configuration.headerHeight).toFloat())
        } else if (canRefresh && event.actionMasked == MotionEvent.ACTION_UP && pullDistance >= px(configuration.threshold)) {
          awaitingRefresh = true
          setRefreshState("refreshing")
          settleTo(px(configuration.headerHeight).toFloat())
          emit("topRefreshRequested", Arguments.createMap().apply { putInt("sequence", ++refreshSequence) })
          postDelayed(ackTimeout, 1000)
        } else settleTo(0f)
      }
    }
    return true
  }

  private fun setPullDistance(value: Float) {
    pullDistance = value
    recycler.translationY = value
    header?.translationY = value - px(configuration.headerHeight)
    header?.visibility = if (value > 0f) VISIBLE else INVISIBLE
    syncSlotPositions()
    scheduleObservation()
    emit("topPullProgress", Arguments.createMap().apply {
      putDouble("distance", dp(value))
      putDouble("progress", (dp(value) / configuration.threshold).coerceIn(0.0, 1.0))
    })
  }

  private fun setRefreshState(value: String) {
    if (refreshState == value) return
    refreshState = value
    emit("topRefreshStateChange", Arguments.createMap().apply { putString("state", value) })
  }

  private fun cancelAnimation() {
    animator?.removeAllListeners()
    animator?.cancel()
    animator = null
  }

  private fun settleTo(target: Float) {
    cancelAnimation()
    if (target == 0f && pullDistance == 0f) { setRefreshState("idle"); return }
    if (target == 0f) setRefreshState("settling")
    animator = ValueAnimator.ofFloat(pullDistance, target).apply {
      duration = 220
      addUpdateListener { setPullDistance(it.animatedValue as Float) }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          animator = null
          if (target == 0f) setRefreshState("idle")
        }
      })
      start()
    }
  }

  private fun emit(name: String, data: WritableMap) {
    if (destroyed || id == NO_ID || !isAttachedToWindow) return
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      ListEvent(UIManagerHelper.getSurfaceId(this), id, name, data),
    )
  }

  private class ListEvent(surfaceId: Int, viewId: Int, private val name: String, private val data: WritableMap) : Event<ListEvent>(surfaceId, viewId) {
    override fun getEventName(): String = name
    override fun getEventData(): WritableMap = data
    override fun canCoalesce(): Boolean = name == "topPullProgress" || name == "topListScroll"
  }

  companion object {
    // UI-thread-only and shared across view instances so late responses cannot collide.
    private var nextEndReachedRequest = 0L
    private const val MAX_IDLE_PER_TYPE = 5
    private const val MAX_IDLE_TOTAL = 40
  }
}
