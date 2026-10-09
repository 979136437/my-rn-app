package com.margelo.nitro.refresh

import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import java.lang.ref.WeakReference
import java.util.UUID

internal interface RefreshTarget {
  fun startRefresh(notify: Boolean)
  fun finishRefresh()
}

// The registry is accessed only on the UI thread and retains neither side.
internal object RefreshRegistry {
  private val controllers = mutableMapOf<String, WeakReference<HybridRefreshController>>()
  fun register(controller: HybridRefreshController) {
    controllers[controller.instanceId] = WeakReference(controller)
  }
  fun find(id: String) = controllers[id]?.get()
  fun remove(id: String) { controllers.remove(id) }
}

@Keep
@DoNotStrip
class HybridRefreshController : HybridRefreshControllerSpec() {
  override val instanceId = UUID.randomUUID().toString()
  private val handler = Handler(Looper.getMainLooper())
  private var target: WeakReference<RefreshTarget>? = null
  private var onRefresh: (() -> Unit)? = null
  private var onStateChange: ((RefreshState) -> Unit)? = null
  private var onPull: ((RefreshPull) -> Unit)? = null
  private var requestedRefreshing = false
  private var pendingBegin = false
  private var invalidated = false
  private var state = RefreshState.IDLE

  private fun onMain(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else handler.post { action() }
  }

  override fun configure(onRefresh: () -> Unit, onStateChange: (RefreshState) -> Unit, onPull: (RefreshPull) -> Unit) {
    onMain {
      if (!invalidated) {
        this.onRefresh = onRefresh
        this.onStateChange = onStateChange
        this.onPull = onPull
        RefreshRegistry.register(this)
      }
    }
  }

  internal fun bind(view: RefreshTarget) {
    if (invalidated || target?.get() === view) return
    target = WeakReference(view)
    if (requestedRefreshing) view.startRefresh(false)
    else if (pendingBegin) {
      pendingBegin = false
      view.startRefresh(true)
    }
  }

  internal fun unbind(view: RefreshTarget) {
    if (target?.get() === view) {
      target = null
      state = RefreshState.IDLE
    }
  }

  override fun setRefreshing(refreshing: Boolean) {
    onMain {
      if (!invalidated) {
        requestedRefreshing = refreshing
        if (refreshing) {
          pendingBegin = false
          target?.get()?.startRefresh(false)
        } else {
          pendingBegin = false
          target?.get()?.finishRefresh()
        }
      }
    }
  }

  override fun beginRefresh() {
    onMain {
      if (!invalidated && !requestedRefreshing && !pendingBegin && state == RefreshState.IDLE) {
        val view = target?.get()
        if (view == null) pendingBegin = true else view.startRefresh(true)
      }
    }
  }

  internal fun refreshStarted(notify: Boolean) {
    if (invalidated) return
    emitState(RefreshState.REFRESHING)
    if (notify) onRefresh?.invoke()
  }

  internal fun emitState(value: RefreshState) {
    if (!invalidated && value != state) {
      state = value
      onStateChange?.invoke(value)
      // A new controlled true may arrive while the previous refresh is closing.
      if (value == RefreshState.IDLE && requestedRefreshing) target?.get()?.startRefresh(false)
    }
  }

  internal fun emitPull(offset: Double, height: Double, isDragging: Boolean) {
    if (!invalidated && height > 0) onPull?.invoke(RefreshPull(offset, offset / height, height, isDragging))
  }

  override fun invalidate() {
    onMain {
      if (invalidated) return@onMain
      invalidated = true
      onRefresh = null
      onStateChange = null
      onPull = null
      pendingBegin = false
      target?.get()?.finishRefresh()
      target = null
      RefreshRegistry.remove(instanceId)
    }
  }
}
