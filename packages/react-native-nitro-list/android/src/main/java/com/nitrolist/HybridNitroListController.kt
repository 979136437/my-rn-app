package com.nitrolist

import android.os.Handler
import android.os.Looper
import com.margelo.nitro.nitrolist.HybridNitroListControllerSpec
import com.margelo.nitro.nitrolist.ListConfig
import com.margelo.nitro.nitrolist.ListItem
import com.margelo.nitro.nitrolist.ListLayout
import com.margelo.nitro.nitrolist.ListSnapshot
import com.margelo.nitro.nitrolist.SlotBinding
import java.util.concurrent.atomic.AtomicLong

/** Nitro never reads or mutates an Android View from the JS thread. */
open class HybridNitroListController : HybridNitroListControllerSpec() {
  private val ui = Handler(Looper.getMainLooper())
  private val generation = AtomicLong()
  private var registeredId: String? = null
  private var currentView: NitroListView? = null
  private var callback: ((ListSnapshot) -> Unit)? = null
  private var configuration = Configuration()
  private var items: List<Entry> = emptyList()
  private var refreshing = false

  override fun connect(listId: String, onSnapshot: (ListSnapshot) -> Unit) {
    require(listId.isNotEmpty()) { "NitroListController.connect requires a list ID" }
    val epoch = generation.incrementAndGet()
    ui.post {
      if (generation.get() != epoch) return@post
      registeredId?.let { NitroListRegistry.disconnect(it, this) }
      registeredId = listId
      callback = onSnapshot
      NitroListRegistry.connect(listId, this)
    }
  }

  override fun configure(config: ListConfig) {
    require(config.numColumns.isFinite() && config.numColumns >= 1 && config.numColumns % 1.0 == 0.0) { "numColumns must be a positive integer" }
    require(config.gap.isFinite() && config.gap >= 0) { "gap must be finite and non-negative" }
    require(config.estimatedItemSize.isFinite() && config.estimatedItemSize > 0) { "estimatedItemSize must be positive" }
    require(config.refreshHeaderHeight.isFinite() && config.refreshHeaderHeight > 0) { "refreshHeaderHeight must be positive" }
    require(config.refreshThreshold.isFinite() && config.refreshThreshold > 0) { "refreshThreshold must be positive" }
    val next = Configuration(config.layout == ListLayout.MASONRY, config.numColumns.toInt(), config.gap,
      config.estimatedItemSize, config.refreshEnabled, config.refreshHeaderHeight, config.refreshThreshold)
    onUI { configuration = next; currentView?.configure(next) }
  }

  override fun setItems(items: Array<ListItem>) {
    require(items.map { it.key }.toSet().size == items.size) { "NitroList requires unique item keys" }
    val next = items.map { Entry(it.key, it.type, it.version) }
    onUI { this.items = next; currentView?.setItems(next) }
  }

  override fun setRefreshing(refreshing: Boolean) {
    onUI { this.refreshing = refreshing; currentView?.setRefreshing(refreshing) }
  }

  override fun reportMeasurement(slotId: String, token: Double, version: Double, width: Double, height: Double) {
    onUI { currentView?.reportMeasurement(slotId, token, version, width, height) }
  }

  override fun scrollToOffset(offset: Double, animated: Boolean) {
    require(offset.isFinite()) { "scrollToOffset requires a finite offset" }
    onUI { currentView?.scrollToOffset(offset, animated) }
  }

  override fun scrollToEnd(animated: Boolean) { onUI { currentView?.scrollToEnd(animated) } }

  override fun disconnect() {
    val epoch = generation.incrementAndGet()
    ui.post {
      if (generation.get() != epoch) return@post
      registeredId?.let { NitroListRegistry.disconnect(it, this) }
      registeredId = null
      callback = null
      items = emptyList()
      refreshing = false
    }
  }

  internal fun attach(view: NitroListView) {
    if (currentView === view) { view.publishCurrentSnapshot(); return }
    detachCurrentView()
    currentView = view
    val epoch = generation.get()
    view.onSnapshot = { bindings, createdCells, rebinds ->
      if (generation.get() == epoch && currentView === view) {
        callback?.invoke(ListSnapshot(bindings.map {
          SlotBinding(it.slotId, it.key, it.index.toDouble(), it.type, it.token, it.version, it.active)
        }.toTypedArray(), createdCells.toDouble(), rebinds.toDouble()))
      }
    }
    view.configure(configuration)
    view.setItems(items)
    view.setRefreshing(refreshing)
    view.publishCurrentSnapshot()
  }

  internal fun detach(view: NitroListView) {
    if (currentView === view) detachCurrentView()
  }

  internal fun detachCurrentView() {
    currentView?.onSnapshot = null
    currentView = null
  }

  private inline fun onUI(crossinline operation: () -> Unit) {
    val epoch = generation.get()
    ui.post { if (generation.get() == epoch && registeredId != null) operation() }
  }
}
