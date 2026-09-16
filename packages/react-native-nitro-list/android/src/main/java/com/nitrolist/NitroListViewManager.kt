package com.nitrolist

import android.view.View
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.NitroListViewManagerDelegate
import com.facebook.react.viewmanagers.NitroListViewManagerInterface
import com.facebook.react.viewmanagers.NitroListSlotViewManagerDelegate
import com.facebook.react.viewmanagers.NitroListSlotViewManagerInterface

@ReactModule(name = NitroListViewManager.NAME)
class NitroListViewManager : ViewGroupManager<NitroListView>(), NitroListViewManagerInterface<NitroListView> {
  private val delegate = NitroListViewManagerDelegate<NitroListView, NitroListViewManager>(this)
  override fun getDelegate(): ViewManagerDelegate<NitroListView> = delegate
  override fun getName(): String = NAME
  override fun createViewInstance(context: ThemedReactContext): NitroListView = NitroListView(context)
  @ReactProp(name = "listId")
  override fun setListId(view: NitroListView, value: String?) = view.updateListId(value.orEmpty())
  override fun addView(parent: NitroListView, child: View, index: Int) = parent.addLogicalChild(child, index)
  override fun getChildCount(parent: NitroListView): Int = parent.logicalChildren.size
  override fun getChildAt(parent: NitroListView, index: Int): View = parent.logicalChildren[index]
  override fun removeViewAt(parent: NitroListView, index: Int) = parent.removeLogicalChild(index)
  override fun removeAllViews(parent: NitroListView) = parent.removeAllLogicalChildren()
  override fun needsCustomLayoutForChildren(): Boolean = true
  override fun onDropViewInstance(view: NitroListView) {
    view.dispose()
    super.onDropViewInstance(view)
  }
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> = mutableMapOf(
    "topRefreshRequested" to mapOf("registrationName" to "onRefreshRequested"),
    "topRefreshStateChange" to mapOf("registrationName" to "onRefreshStateChange"),
    "topPullProgress" to mapOf("registrationName" to "onPullProgress"),
  )
  companion object { const val NAME = "NitroListView" }
}

@ReactModule(name = NitroListSlotViewManager.NAME)
class NitroListSlotViewManager : ViewGroupManager<NitroListSlotView>(), NitroListSlotViewManagerInterface<NitroListSlotView> {
  private val delegate = NitroListSlotViewManagerDelegate<NitroListSlotView, NitroListSlotViewManager>(this)
  override fun getDelegate(): ViewManagerDelegate<NitroListSlotView> = delegate
  override fun getName(): String = NAME
  override fun createViewInstance(context: ThemedReactContext): NitroListSlotView = NitroListSlotView(context)
  @ReactProp(name = "listId")
  override fun setListId(view: NitroListSlotView, value: String?) { view.listId = value.orEmpty() }
  @ReactProp(name = "slotId")
  override fun setSlotId(view: NitroListSlotView, value: String?) { view.slotId = value.orEmpty() }
  @ReactProp(name = "bindingToken")
  override fun setBindingToken(view: NitroListSlotView, value: Double) { view.bindingToken = value }
  @ReactProp(name = "itemVersion")
  override fun setItemVersion(view: NitroListSlotView, value: Double) { view.itemVersion = value }
  override fun onAfterUpdateTransaction(view: NitroListSlotView) {
    super.onAfterUpdateTransaction(view)
    view.didCommitProps()
  }
  override fun updateState(view: NitroListSlotView, props: ReactStylesDiffMap, stateWrapper: StateWrapper): Any? {
    view.setFabricState(stateWrapper)
    return null
  }
  override fun onDropViewInstance(view: NitroListSlotView) {
    view.dispose()
    super.onDropViewInstance(view)
  }
  companion object { const val NAME = "NitroListSlotView" }
}
