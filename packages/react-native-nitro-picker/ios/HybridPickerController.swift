import Foundation
import UIKit

private final class PickerScrollDelegate: NSObject, UIScrollViewDelegate {
  weak var owner: HybridPickerController?

  init(owner: HybridPickerController) {
    self.owner = owner
    super.init()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    owner?.scrollViewWillBeginDragging(scrollView)
  }

  func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint,
                                 targetContentOffset: UnsafeMutablePointer<CGPoint>) {
    owner?.scrollViewWillEndDragging(scrollView, withVelocity: velocity, targetContentOffset: targetContentOffset)
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    owner?.scrollViewDidEndDragging(scrollView, willDecelerate: decelerate)
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    owner?.scrollViewDidEndDecelerating(scrollView)
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    owner?.scrollViewDidEndScrollingAnimation(scrollView)
  }
}

/// React owns the option views; UIKit owns the scroll gesture and deceleration.
final class HybridPickerController: HybridPickerControllerSpec {
  private lazy var scrollDelegate = PickerScrollDelegate(owner: self)
  private weak var scrollView: UIScrollView?
  private var config: PickerConfig?
  private var callback: ((PickerEvent) -> Void)?
  private var generation = 0
  private var active = false
  private var selected = -1
  private var reported = -1
  private var pendingPosition = false
  private var observedContentSize: NSKeyValueObservation?
  private var observedFrame: NSKeyValueObservation?
  private var backgroundObserver: NSObjectProtocol?
  private var foregroundObserver: NSObjectProtocol?

  func connect(viewTag: Double, config: PickerConfig, callback: @escaping (PickerEvent) -> Void) throws {
    try validate(config)
    guard viewTag.isFinite, viewTag > 0, viewTag <= Double(Int.max), viewTag.rounded() == viewTag else {
      throw PickerError.invalidTag
    }
    generation += 1
    let token = generation
    onMain { [weak self] in
      guard let self = self, self.generation == token else { return }
      self.clear()
      self.config = config
      self.callback = callback
      self.selected = Int(config.selectedIndex)
      self.reported = self.selected
      self.pendingPosition = true
      self.resolve(tag: Int(viewTag), attempt: 0, token: token)
    }
  }

  func configure(config: PickerConfig) throws {
    try validate(config)
    let token = generation
    onMain { [weak self] in
      guard let self = self, self.generation == token, let old = self.config else { return }
      let structural = old.epoch != config.epoch || old.count != config.count || old.itemHeight != config.itemHeight
      let changed = old.selectedIndex != config.selectedIndex
      let acknowledged = self.active && !structural && Int(config.selectedIndex) == self.reported
      if structural || (changed && !acknowledged) { self.endCycle() }
      self.config = config
      if acknowledged { return }
      if structural || changed || !self.active {
        self.selected = Int(config.selectedIndex)
        self.reported = self.selected
        self.pendingPosition = true
        self.positionIfReady()
      }
    }
  }

  func step(delta: Double) throws {
    guard delta.isFinite else { return }
    let token = generation
    onMain { [weak self] in
      guard let self = self, self.generation == token, delta != 0,
            let scroll = self.scrollView, self.isReady(scroll), self.count > 0 else { return }
      self.endCycle()
      let next = min(self.count - 1, max(0, self.nearest(scroll.contentOffset.y) + (delta > 0 ? 1 : -1)))
      self.beginCycle()
      if self.config?.immediateChange == true { self.report(next) }
      self.animate(to: next)
    }
  }

  func stop() throws {
    let token = generation
    onMain { [weak self] in
      guard let self = self, self.generation == token else { return }
      self.endCycle()
      self.pendingPosition = true
      self.positionIfReady()
    }
  }

  func disconnect() throws {
    generation += 1
    let token = generation
    onMain { [weak self] in
      guard let self = self, self.generation == token else { return }
      self.clear()
    }
  }

  func dispose() { try? disconnect() }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }

  private func validate(_ value: PickerConfig) throws {
    guard value.epoch.isFinite, value.count.isFinite, value.count >= 0,
          value.count <= Double(Int32.max), value.count.rounded() == value.count,
          value.itemHeight.isFinite, value.itemHeight > 0,
          value.selectedIndex.isFinite, value.selectedIndex.rounded() == value.selectedIndex,
          (value.count == 0 ? value.selectedIndex == -1 : value.selectedIndex >= 0 && value.selectedIndex < value.count)
    else { throw PickerError.invalidConfig }
  }

  private func resolve(tag: Int, attempt: Int, token: Int) {
    guard generation == token, callback != nil else { return }
    if let scroll = NitroPickerScrollBridge.scrollView(forTag: tag) {
      scrollView = scroll
      scroll.isScrollEnabled = true
      scroll.bounces = false
      scroll.showsVerticalScrollIndicator = false
      NitroPickerScrollBridge.add(scrollDelegate, to: scroll)
      observedContentSize = scroll.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
        self?.onMain { [weak self] in self?.positionIfReady() }
      }
      observedFrame = scroll.observe(\.frame, options: [.new]) { [weak self] _, _ in
        self?.onMain { [weak self] in
          self?.endCycle()
          self?.pendingPosition = true
          self?.positionIfReady()
        }
      }
      backgroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.endCycle()
        self?.pendingPosition = true
      }
      foregroundObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.positionIfReady() }
      positionIfReady()
    } else if attempt < 12 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { [weak self] in
        self?.resolve(tag: tag, attempt: attempt + 1, token: token)
      }
    } else {
      emit("error", index: -1, error: "Unable to connect to Fabric ScrollView tag \(tag).")
    }
  }

  private var count: Int { Int(config?.count ?? 0) }
  private var rowHeight: CGFloat { CGFloat(config?.itemHeight ?? 44) }
  private func offset(_ index: Int) -> CGFloat { CGFloat(max(index, 0)) * rowHeight }
  private func nearest(_ y: CGFloat) -> Int {
    guard count > 0 else { return -1 }
    return min(count - 1, max(0, Int((y / rowHeight).rounded())))
  }

  private func isReady(_ scroll: UIScrollView) -> Bool {
    let expected = CGFloat(count) * rowHeight + max(0, scroll.bounds.height - rowHeight)
    return scroll.bounds.width > 0 && scroll.bounds.height > 0 && abs(scroll.contentSize.height - expected) <= 3
  }

  private func positionIfReady() {
    guard pendingPosition, let scroll = scrollView, isReady(scroll) else { return }
    pendingPosition = false
    scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: offset(selected)), animated: false)
  }

  private func beginCycle() {
    guard !active else { return }
    active = true
    pendingPosition = false
    emit("start", index: selected)
  }

  private func report(_ index: Int) {
    selected = index
    guard index != reported else { return }
    reported = index
    emit("change", index: index)
  }

  private func endCycle() {
    guard active else { return }
    if let scroll = scrollView { scroll.setContentOffset(scroll.contentOffset, animated: false) }
    active = false
    emit("end", index: selected)
  }

  private func settle() {
    guard active, let scroll = scrollView else { return }
    let target = nearest(scroll.contentOffset.y)
    if abs(scroll.contentOffset.y - offset(target)) > 0.5 {
      animate(to: target)
    } else {
      report(target)
      endCycle()
    }
  }

  private func animate(to index: Int) {
    guard let scroll = scrollView else { return }
    let y = offset(index)
    if abs(scroll.contentOffset.y - y) <= 0.5 {
      report(index)
      endCycle()
    } else {
      scroll.setContentOffset(CGPoint(x: scroll.contentOffset.x, y: y), animated: true)
    }
  }

  private func emit(_ phase: String, index: Int, error: String = "") {
    guard let config = config else { return }
    callback?(PickerEvent(epoch: config.epoch, index: Double(index), phase: phase, error: error))
  }

  private func clear() {
    endCycle()
    observedContentSize = nil
    observedFrame = nil
    if let observer = backgroundObserver { NotificationCenter.default.removeObserver(observer) }
    if let observer = foregroundObserver { NotificationCenter.default.removeObserver(observer) }
    backgroundObserver = nil
    foregroundObserver = nil
    if let scroll = scrollView { NitroPickerScrollBridge.remove(scrollDelegate, from: scroll) }
    scrollView = nil
    config = nil
    callback = nil
    pendingPosition = false
  }

  fileprivate func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    endCycle()
    beginCycle()
  }

  fileprivate func scrollViewWillEndDragging(_ scrollView: UIScrollView, withVelocity velocity: CGPoint,
                                 targetContentOffset: UnsafeMutablePointer<CGPoint>) {
    guard active, count > 0 else { return }
    let target = nearest(targetContentOffset.pointee.y)
    targetContentOffset.pointee.y = offset(target)
    if config?.immediateChange == true { report(target) }
  }

  fileprivate func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { settle() }
  }

  fileprivate func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { settle() }
  fileprivate func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    guard active else { return }
    report(nearest(scrollView.contentOffset.y))
    endCycle()
  }
}

private enum PickerError: Error {
  case invalidTag
  case invalidConfig
}
