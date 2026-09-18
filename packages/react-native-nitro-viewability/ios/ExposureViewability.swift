import UIKit

/// Shared geometry and dwell rules for ordinary views and native list adapters.
public enum ExposureViewability {
  public static func visiblePercent(of view: UIView) -> Double {
    guard let window = view.window, !view.isHidden, view.alpha > 0,
          view.bounds.width > 0, view.bounds.height > 0,
          !window.isHidden, window.alpha > 0 else { return 0 }

    let full = view.convert(view.bounds, to: window).standardized
    let area = full.width * full.height
    guard area.isFinite, area > 0 else { return 0 }

    var visible = full.intersection(window.bounds)
    guard !visible.isNull, !visible.isEmpty else { return 0 }
    var ancestor: UIView? = view
    while let node = ancestor {
      guard !node.isHidden, node.alpha > 0 else { return 0 }
      if node.clipsToBounds || node.layer.masksToBounds {
        visible = visible.intersection(node.convert(node.bounds, to: window))
        if visible.isNull || visible.isEmpty { return 0 }
      }
      ancestor = node.superview
    }
    return min(100, max(0, Double(visible.width * visible.height / area * 100)))
  }
}

public final class ExposureDwellTracker {
  private var visibleSince: TimeInterval?

  public init() {}

  public func reset() { visibleSince = nil }

  /// Returns visibility and the time remaining until the next useful sample.
  public func update(percent: Double, threshold: Double, minimumViewTime: Double,
              now: TimeInterval) -> (Bool, TimeInterval?) {
    guard percent.isFinite, percent > 0, percent >= threshold else {
      reset()
      return (false, nil)
    }
    if visibleSince == nil || now < visibleSince! { visibleSince = now }
    let remaining = ceil(minimumViewTime) - (now - visibleSince!) * 1000
    return remaining <= 0 ? (true, nil) : (false, remaining / 1000)
  }
}
