package com.margelo.nitro.picker

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

class NitroPickerPackage : BaseReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? = null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider { emptyMap() }
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = listOf(NitroPickerColumnManager())
  companion object {
    init { NitroPickerOnLoad.initializeNative() }
  }
}
