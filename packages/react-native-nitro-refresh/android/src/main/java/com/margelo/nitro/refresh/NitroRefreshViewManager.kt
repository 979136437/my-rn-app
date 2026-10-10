package com.margelo.nitro.refresh

import android.view.View
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.NitroRefreshViewManagerDelegate
import com.facebook.react.viewmanagers.NitroRefreshViewManagerInterface

internal class NitroRefreshViewManager : ViewGroupManager<NitroRefreshView>(), NitroRefreshViewManagerInterface<NitroRefreshView> {
  private val delegate = NitroRefreshViewManagerDelegate(this)
  override fun getDelegate(): ViewManagerDelegate<NitroRefreshView> = delegate
  override fun getName() = "NitroRefreshView"
  override fun createViewInstance(context: ThemedReactContext) = NitroRefreshView(context)
  override fun needsCustomLayoutForChildren() = true
  override fun addView(parent: NitroRefreshView, child: View, index: Int) = parent.mount(child, index)
  override fun getChildCount(parent: NitroRefreshView) = parent.reactChildren.size
  override fun getChildAt(parent: NitroRefreshView, index: Int) = parent.reactChildren[index]
  override fun removeViewAt(parent: NitroRefreshView, index: Int) = parent.unmount(index)
  override fun onDropViewInstance(view: NitroRefreshView) {
    view.release()
    super.onDropViewInstance(view)
  }
  @ReactProp(name = "controllerId")
  override fun setControllerId(view: NitroRefreshView, value: String?) = view.setControllerId(value ?: "")
  @ReactProp(name = "enabled", defaultBoolean = true)
  override fun setEnabled(view: NitroRefreshView, value: Boolean) { view.refreshEnabled = value }
  @ReactProp(name = "triggerDistance", defaultFloat = DEFAULT_HEADER_HEIGHT_DP)
  override fun setTriggerDistance(view: NitroRefreshView, value: Float) { view.triggerDistance = value }
  @ReactProp(name = "headerHeight", defaultFloat = DEFAULT_HEADER_HEIGHT_DP)
  override fun setHeaderHeight(view: NitroRefreshView, value: Float) { view.headerHeight = value }
}
