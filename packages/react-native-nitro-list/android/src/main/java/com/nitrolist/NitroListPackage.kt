package com.nitrolist

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.nitrolist.NitroListOnLoad

class NitroListPackage : ReactPackage {
  init {
    NitroListOnLoad.initializeNative()
  }

  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(NitroListViewManager(), NitroListSlotViewManager())
}
