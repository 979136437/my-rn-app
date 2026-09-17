package com.nitrolist

import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.views.view.ReactViewGroup

/** A Fabric-owned subtree. Its physical parent is a cell, its logical parent is NitroListView. */
class NitroListSlotView(context: ThemedReactContext) : ReactViewGroup(context) {
  var listId: String = ""
  var slotId: String = ""
  var accessoryRole: String = ""
  var bindingToken: Double = -1.0
  var itemVersion: Double = -1.0
  private var stateWrapper: StateWrapper? = null
  private var lastOffsetLeft: Double? = null
  private var lastOffsetTop: Double? = null

  internal fun setFabricState(wrapper: StateWrapper) {
    stateWrapper = wrapper
    NitroListRegistry.view(listId)?.syncSlotPosition(this)
  }

  internal fun updateContentOffset(left: Double, top: Double) {
    val wrapper = stateWrapper ?: return
    if (lastOffsetLeft == left && lastOffsetTop == top) return
    lastOffsetLeft = left
    lastOffsetTop = top
    wrapper.updateState(Arguments.createMap().apply {
      putDouble("offsetLeft", left)
      putDouble("offsetTop", top)
    })
  }

  internal fun dispose() {
    // StateWrapper lifetime is owned by Fabric; only release our reference.
    stateWrapper = null
    lastOffsetLeft = null
    lastOffsetTop = null
  }

  // Props setters can be called in any order. Publish only after the entire transaction commits.
  internal fun didCommitProps() {
    NitroListRegistry.view(listId)?.slotDidCommit(this)
  }
}
