package com.margelo.nitro.picker

import android.view.View
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.NitroPickerColumnManagerDelegate
import com.facebook.react.viewmanagers.NitroPickerColumnManagerInterface

internal class NitroPickerColumnManager : ViewGroupManager<NitroPickerColumn>(), NitroPickerColumnManagerInterface<NitroPickerColumn> {
  private val delegate = NitroPickerColumnManagerDelegate(this)
  override fun getDelegate(): ViewManagerDelegate<NitroPickerColumn> = delegate
  override fun getName() = "NitroPickerColumn"
  override fun createViewInstance(context: ThemedReactContext) = NitroPickerColumn(context)
  override fun needsCustomLayoutForChildren() = true
  override fun addView(parent: NitroPickerColumn, child: View, index: Int) = parent.mount(child, index)
  override fun getChildCount(parent: NitroPickerColumn) = parent.reactChildren.size
  override fun getChildAt(parent: NitroPickerColumn, index: Int) = parent.reactChildren[index]
  override fun removeViewAt(parent: NitroPickerColumn, index: Int) = parent.unmount(index)
  override fun onAfterUpdateTransaction(view: NitroPickerColumn) {
    super.onAfterUpdateTransaction(view)
    view.commit()
  }
  override fun onDropViewInstance(view: NitroPickerColumn) {
    view.release()
    super.onDropViewInstance(view)
  }
  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
    "topPickerScroll" to mapOf("registrationName" to "onPickerScroll")
  )
  @ReactProp(name = "controllerId")
  override fun setControllerId(view: NitroPickerColumn, value: String?) = view.bindController(value ?: "")
  @ReactProp(name = "enabled", defaultBoolean = true)
  override fun setEnabled(view: NitroPickerColumn, value: Boolean) { view.pickerEnabled = value }
  @ReactProp(name = "itemHeight", defaultFloat = 44f)
  override fun setItemHeight(view: NitroPickerColumn, value: Float) { view.itemHeightDp = value }
}
