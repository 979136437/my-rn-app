package com.viewability.core

import kotlin.math.ceil

/** Caller-defined content identity; a new version starts a fresh dwell period. */
data class ViewabilityIdentity(val key: String, val version: Double)

/** Geometry is collected by the host: area for ordinary views, height for lists. */
data class VisibilitySample(val identity: ViewabilityIdentity, val visiblePercent: Double)

data class ViewabilityResult(val visible: List<ViewabilityIdentity>, val nextCheckDelayMs: Long?)

/**
 * Platform-independent rule engine. Call on one thread with a monotonic clock.
 * The host owns geometry, scheduling, lifecycle, and delivery/deduplication.
 */
class ViewabilityTracker {
  private var threshold = 50.0
  private var minimumViewTime = 0L
  private var waitForInteraction = false
  private val visibleSince = linkedMapOf<ViewabilityIdentity, Long>()

  fun configure(threshold: Double, minimumViewTime: Double, waitForInteraction: Boolean = false): Boolean {
    require(threshold.isFinite() && threshold in 0.0..100.0) { "visible percentage threshold must be between 0 and 100" }
    require(minimumViewTime.isFinite() && minimumViewTime >= 0) { "minimumViewTime must be nonnegative and finite" }
    val duration = ceil(minimumViewTime).toLong()
    val changed = this.threshold != threshold || this.minimumViewTime != duration || this.waitForInteraction != waitForInteraction
    this.threshold = threshold
    this.minimumViewTime = duration
    this.waitForInteraction = waitForInteraction
    if (changed) reset()
    return changed
  }

  fun update(samples: List<VisibilitySample>, now: Long, interacted: Boolean = true): ViewabilityResult {
    require(now >= 0) { "now must be a nonnegative monotonic time" }
    val eligible = linkedSetOf<ViewabilityIdentity>()
    if (!waitForInteraction || interacted) {
      for (sample in samples) {
        val percent = sample.visiblePercent
        if (percent.isFinite() && percent > 0 && percent >= threshold) eligible.add(sample.identity)
      }
    }
    visibleSince.keys.retainAll(eligible)
    val visible = mutableListOf<ViewabilityIdentity>()
    var nextDelay: Long? = null
    for (identity in eligible) {
      val since = visibleSince.getOrPut(identity) { now }
      // A caller replacing its time source cannot accidentally inherit elapsed time.
      if (now < since) visibleSince[identity] = now
      val elapsed = now - (visibleSince[identity] ?: now)
      val remaining = minimumViewTime - elapsed
      if (remaining <= 0) visible.add(identity)
      else nextDelay = minOf(nextDelay ?: remaining, remaining)
    }
    return ViewabilityResult(visible, nextDelay)
  }

  fun reset() { visibleSince.clear() }
}
