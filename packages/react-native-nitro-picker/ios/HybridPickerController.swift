import Foundation
import NitroModules

@objc public protocol NPPickerTarget: AnyObject {
  @objc(applySelection:revision:) func applySelection(_ index: Int, revision: Double)
  @objc(cancelPicking:) func cancelPicking(_ notify: Bool)
}

private struct WeakPickerController {
  weak var value: HybridPickerController?
}

@objc(NPPickerRegistry)
public final class PickerRegistry: NSObject {
  private static var controllers: [String: WeakPickerController] = [:]
  static func register(_ controller: HybridPickerController) {
    controllers[controller.instanceId] = WeakPickerController(value: controller)
  }
  static func remove(_ id: String) { controllers.removeValue(forKey: id) }
  @objc(bindController:target:)
  public static func bind(_ id: String, target: NPPickerTarget) {
    controllers[id]?.value?.bind(target)
  }
  @objc(unbindController:target:)
  public static func unbind(_ id: String, target: NPPickerTarget) {
    controllers[id]?.value?.unbind(target)
  }
  @objc(started:revision:)
  public static func started(_ id: String, revision: Double) {
    controllers[id]?.value?.started(revision)
  }
  @objc(ended:index:revision:cancelled:)
  public static func ended(_ id: String, index: Int, revision: Double, cancelled: Bool) {
    controllers[id]?.value?.ended(index, revision: revision, cancelled: cancelled)
  }
}

final class HybridPickerController: HybridPickerControllerSpec {
  let instanceId = UUID().uuidString
  private weak var target: NPPickerTarget?
  private var onStart: ((Double) -> Void)?
  private var onEnd: ((Double, Double, Bool) -> Void)?
  private var index = 0
  private var revision = 0.0
  private var invalidated = false

  private func onMain(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() }
    else { DispatchQueue.main.async(execute: action) }
  }
  func configure(onStart: @escaping (Double) -> Void, onEnd: @escaping (Double, Double, Bool) -> Void) {
    onMain { [self] in
      guard !invalidated else { return }
      self.onStart = onStart
      self.onEnd = onEnd
      PickerRegistry.register(self)
    }
  }
  func bind(_ view: NPPickerTarget) {
    guard !invalidated, target !== view else { return }
    target = view
    view.applySelection(index, revision: revision)
  }
  func unbind(_ view: NPPickerTarget) {
    if target === view { target = nil }
  }
  func started(_ revision: Double) {
    if !invalidated { onStart?(revision) }
  }
  func ended(_ index: Int, revision: Double, cancelled: Bool) {
    if !invalidated { onEnd?(Double(index), revision, cancelled) }
  }
  func setSelection(index: Double, revision: Double) {
    onMain { [self] in
      guard !invalidated else { return }
      self.index = Int(index)
      self.revision = revision
      target?.applySelection(self.index, revision: revision)
    }
  }
  func invalidate() {
    onMain { [self] in
      guard !invalidated else { return }
      invalidated = true
      onStart = nil
      onEnd = nil
      target?.cancelPicking(false)
      target = nil
      PickerRegistry.remove(instanceId)
    }
  }
}
