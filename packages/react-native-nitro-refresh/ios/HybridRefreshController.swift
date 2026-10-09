import Foundation
import NitroModules

@objc public protocol NRRefreshTarget: AnyObject {
  @objc(startRefreshWithNotify:) func startRefresh(notify: Bool)
  @objc func finishRefresh()
}

private struct WeakRefreshController {
  weak var value: HybridRefreshController?
}

// Fabric calls this adapter on the UI thread; business callbacks use Nitro.
@objc(NRRefreshRegistry)
public final class RefreshRegistry: NSObject {
  private static var controllers: [String: WeakRefreshController] = [:]
  static func register(_ controller: HybridRefreshController) {
    controllers[controller.instanceId] = WeakRefreshController(value: controller)
  }
  static func remove(_ id: String) { controllers.removeValue(forKey: id) }

  @objc(bindController:target:)
  public static func bind(_ id: String, target: NRRefreshTarget) {
    controllers[id]?.value?.bind(target)
  }
  @objc(unbindController:target:)
  public static func unbind(_ id: String, target: NRRefreshTarget) {
    controllers[id]?.value?.unbind(target)
  }
  @objc(refreshStarted:notify:)
  public static func refreshStarted(_ id: String, notify: Bool) {
    controllers[id]?.value?.refreshStarted(notify: notify)
  }
  @objc(emitState:state:)
  public static func emitState(_ id: String, state: String) {
    if let value = RefreshState(fromString: state) {
      controllers[id]?.value?.emitState(value)
    }
  }
  @objc(emitPull:offset:height:isDragging:)
  public static func emitPull(_ id: String, offset: Double, height: Double, isDragging: Bool) {
    controllers[id]?.value?.emitPull(offset: offset, height: height, isDragging: isDragging)
  }
}

final class HybridRefreshController: HybridRefreshControllerSpec {
  let instanceId = UUID().uuidString
  private weak var target: NRRefreshTarget?
  private var onRefresh: (() -> Void)?
  private var onStateChange: ((RefreshState) -> Void)?
  private var onPull: ((RefreshPull) -> Void)?
  private var requestedRefreshing = false
  private var pendingBegin = false
  private var invalidated = false
  private var state: RefreshState = .idle

  private func onMain(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() } else { DispatchQueue.main.async(execute: action) }
  }

  func configure(onRefresh: @escaping () -> Void, onStateChange: @escaping (RefreshState) -> Void, onPull: @escaping (RefreshPull) -> Void) {
    onMain { [self] in
      guard !invalidated else { return }
      self.onRefresh = onRefresh
      self.onStateChange = onStateChange
      self.onPull = onPull
      RefreshRegistry.register(self)
    }
  }

  func bind(_ view: NRRefreshTarget) {
    guard !invalidated, target !== view else { return }
    target = view
    if requestedRefreshing { view.startRefresh(notify: false) }
    else if pendingBegin {
      pendingBegin = false
      view.startRefresh(notify: true)
    }
  }

  func unbind(_ view: NRRefreshTarget) {
    if target === view {
      target = nil
      state = .idle
    }
  }

  func setRefreshing(refreshing: Bool) {
    onMain { [self] in
      guard !invalidated else { return }
      requestedRefreshing = refreshing
      pendingBegin = false
      if refreshing { target?.startRefresh(notify: false) }
      else { target?.finishRefresh() }
    }
  }

  func beginRefresh() {
    onMain { [self] in
      guard !invalidated, !requestedRefreshing, !pendingBegin, state == .idle else { return }
      if let target { target.startRefresh(notify: true) } else { pendingBegin = true }
    }
  }

  func refreshStarted(notify: Bool) {
    guard !invalidated else { return }
    emitState(.refreshing)
    if notify { onRefresh?() }
  }

  func emitState(_ value: RefreshState) {
    guard !invalidated, value != state else { return }
    state = value
    onStateChange?(value)
    if value == .idle && requestedRefreshing { target?.startRefresh(notify: false) }
  }

  func emitPull(offset: Double, height: Double, isDragging: Bool) {
    guard !invalidated, height > 0 else { return }
    onPull?(RefreshPull(offset: offset, progress: offset / height, headerHeight: height, isDragging: isDragging))
  }

  func invalidate() {
    onMain { [self] in
      guard !invalidated else { return }
      invalidated = true
      onRefresh = nil
      onStateChange = nil
      onPull = nil
      pendingBegin = false
      target?.finishRefresh()
      target = nil
      RefreshRegistry.remove(instanceId)
    }
  }
}
