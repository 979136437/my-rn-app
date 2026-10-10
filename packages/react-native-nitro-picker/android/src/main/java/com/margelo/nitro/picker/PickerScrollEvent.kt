package com.margelo.nitro.picker

import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.events.Event

internal class PickerScrollEvent(surfaceId: Int, viewTag: Int, private val offset: Double, private val height: Double) : Event<PickerScrollEvent>(surfaceId, viewTag) {
  override fun getEventName() = "topPickerScroll"
  override fun getEventData() = Arguments.createMap().apply {
    putDouble("offset", offset)
    putDouble("height", height)
  }
}
