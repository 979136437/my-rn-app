package com.nitrolist

import java.lang.ref.WeakReference

/** Accessed exclusively on Android's UI thread; a controller may arrive before Fabric mounts. */
internal object NitroListRegistry {
  private val views = mutableMapOf<String, WeakReference<NitroListView>>()
  private val controllers = mutableMapOf<String, WeakReference<HybridNitroListController>>()

  fun register(id: String, view: NitroListView) {
    if (id.isEmpty()) return
    views[id] = WeakReference(view)
    controllers[id]?.get()?.attach(view)
  }

  fun unregister(id: String, view: NitroListView) {
    if (views[id]?.get() !== view) return
    controllers[id]?.get()?.detach(view)
    views.remove(id)
  }

  fun connect(id: String, controller: HybridNitroListController) {
    val previous = controllers[id]?.get()
    if (previous !== controller) previous?.detachCurrentView()
    controllers[id] = WeakReference(controller)
    views[id]?.get()?.let(controller::attach)
  }

  fun disconnect(id: String, controller: HybridNitroListController) {
    if (controllers[id]?.get() !== controller) return
    controller.detachCurrentView()
    controllers.remove(id)
  }

  fun view(id: String): NitroListView? = views[id]?.get()
}
