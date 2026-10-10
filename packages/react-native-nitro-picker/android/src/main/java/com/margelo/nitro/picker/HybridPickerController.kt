package com.margelo.nitro.picker

import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import java.lang.ref.WeakReference
import java.util.UUID

internal interface PickerTarget {
  fun applySelection(index: Int, revision: Double)
  fun cancelPicking(notify: Boolean)
}

// Main-thread registry; Fabric and Nitro do not retain one another.
internal object PickerRegistry {
  private val controllers = mutableMapOf<String, WeakReference<HybridPickerController>>()
  fun register(controller: HybridPickerController) {
    controllers[controller.instanceId] = WeakReference(controller)
  }
  fun find(id: String) = controllers[id]?.get()
  fun remove(id: String) { controllers.remove(id) }
}

@Keep
@DoNotStrip
class HybridPickerController : HybridPickerControllerSpec() {
  override val instanceId = UUID.randomUUID().toString()
  private val handler = Handler(Looper.getMainLooper())
  private var target: WeakReference<PickerTarget>? = null
  private var onStart: ((Double) -> Unit)? = null
  private var onEnd: ((Double, Double, Boolean) -> Unit)? = null
  private var index = 0
  private var revision = 0.0
  private var invalidated = false

  private fun onMain(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post { action() }
  }

  override fun configure(onStart: (Double) -> Unit, onEnd: (Double, Double, Boolean) -> Unit) {
    onMain {
      if (invalidated) return@onMain
      this.onStart = onStart
      this.onEnd = onEnd
      PickerRegistry.register(this)
    }
  }

  internal fun bind(view: PickerTarget) {
    if (invalidated || target?.get() === view) return
    target = WeakReference(view)
    view.applySelection(index, revision)
  }

  internal fun unbind(view: PickerTarget) {
    if (target?.get() === view) target = null
  }

  internal fun started(revision: Double) {
    if (!invalidated) onStart?.invoke(revision)
  }

  internal fun ended(index: Int, revision: Double, cancelled: Boolean) {
    if (!invalidated) onEnd?.invoke(index.toDouble(), revision, cancelled)
  }

  override fun setSelection(index: Double, revision: Double) {
    onMain {
      if (invalidated) return@onMain
      this.index = index.toInt()
      this.revision = revision
      target?.get()?.applySelection(this.index, revision)
    }
  }

  override fun invalidate() {
    onMain {
      if (invalidated) return@onMain
      invalidated = true
      onStart = null
      onEnd = null
      target?.get()?.cancelPicking(false)
      target = null
      PickerRegistry.remove(instanceId)
    }
  }
}
