import Foundation
import UIKit
import NitroModules

private final class ExposureFrameTarget: NSObject {
  var onFrame: (() -> Void)?
  @objc func tick() { onFrame?() }
}

final class HybridExposureController: HybridExposureControllerSpec {
  private let generationLock = NSLock()
  private var generation = 0
  // The remaining state is confined to the main queue.
  private var session = 0
  private var tag = 0
  private weak var target: UIView?
  private var config: ExposureConfig?
  private var callback: ((ExposureEvent) -> Void)?
  private var isViewable = false
  private let tracker = ExposureDwellTracker()
  private var displayLink: CADisplayLink?
  private let frameTarget = ExposureFrameTarget()
  private var deadline: Timer?
  private var resolution: DispatchWorkItem?
  private var notifications: [NSObjectProtocol] = []

  deinit {
    let link = displayLink
    let timer = deadline
    let work = resolution
    let observers = notifications
    DispatchQueue.main.async {
      link?.invalidate()
      timer?.invalidate()
      work?.cancel()
      observers.forEach { NotificationCenter.default.removeObserver($0) }
    }
  }

  func observe(targetTag: Double, config: ExposureConfig,
               callback: @escaping (ExposureEvent) -> Void) throws {
    guard targetTag.isFinite, targetTag > 0, targetTag <= Double(Int.max),
          targetTag.rounded(.towardZero) == targetTag else {
      throw NSError(domain: "ExposureController", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "ExposureController.observe requires a native View tag"])
    }
    try validate(config)
    let command = nextGeneration()
    DispatchQueue.main.async { [weak self] in
      guard let self, self.currentGeneration() == command else { return }
      self.clear()
      self.tag = Int(targetTag)
      self.callback = callback
      self.restart(config)
    }
  }

  func configure(config: ExposureConfig) throws {
    try validate(config)
    let command = currentGeneration()
    DispatchQueue.main.async { [weak self] in
      guard let self, self.currentGeneration() == command, self.callback != nil else { return }
      self.restart(config)
    }
  }

  func disconnect() throws {
    let command = nextGeneration()
    DispatchQueue.main.async { [weak self] in
      guard let self, self.currentGeneration() == command else { return }
      self.clear()
    }
  }

  private func validate(_ config: ExposureConfig) throws {
    guard config.epoch.isFinite, config.visiblePercentThreshold.isFinite,
          (0...100).contains(config.visiblePercentThreshold),
          config.minimumViewTime.isFinite, config.minimumViewTime >= 0 else {
      throw NSError(domain: "ExposureController", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid exposure epoch, threshold, or minimumViewTime"])
    }
  }

  private func nextGeneration() -> Int {
    generationLock.lock(); defer { generationLock.unlock() }
    generation += 1
    return generation
  }

  private func currentGeneration() -> Int {
    generationLock.lock(); defer { generationLock.unlock() }
    return generation
  }

  private func restart(_ configuration: ExposureConfig) {
    releaseBindings()
    session += 1
    config = configuration
    isViewable = false
    tracker.reset()
    emit(false, percent: 0)
    let expected = session
    resolve(expected: expected, attempt: 0)
  }

  private func resolve(expected: Int, attempt: Int) {
    guard session == expected, callback != nil else { return }
    if let view = findView(tag: tag) {
      target = view
      bind()
      sample()
    } else if attempt < 8 {
      let work = DispatchWorkItem { [weak self] in
        self?.resolution = nil
        self?.resolve(expected: expected, attempt: attempt + 1)
      }
      resolution = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.032, execute: work)
    } else {
      emit(false, percent: 0, error: "Unable to resolve native View tag \(tag). Forward the ref to a mounted View and set collapsable={false}.")
    }
  }

  private func findView(tag: Int) -> UIView? {
    for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
      for window in scene.windows {
        if let view = findView(tag: tag, in: window) { return view }
      }
    }
    return nil
  }

  private func findView(tag: Int, in root: UIView) -> UIView? {
    if root.tag == tag { return root }
    for child in root.subviews {
      if let view = findView(tag: tag, in: child) { return view }
    }
    return nil
  }

  private func bind() {
    let center = NotificationCenter.default
    for name in [UIApplication.willResignActiveNotification,
                 UIApplication.didBecomeActiveNotification,
                 UIApplication.didEnterBackgroundNotification,
                 UIScene.willDeactivateNotification,
                 UIScene.didActivateNotification] {
      notifications.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] notice in
        guard let self else { return }
        if let scene = notice.object as? UIWindowScene,
           let observedScene = self.target?.window?.windowScene,
           scene !== observedScene { return }
        self.tracker.reset()
        let leaving = name == UIApplication.willResignActiveNotification ||
          name == UIApplication.didEnterBackgroundNotification ||
          name == UIScene.willDeactivateNotification
        self.sample(forceInvisible: leaving)
      })
    }
    frameTarget.onFrame = { [weak self] in self?.sample() }
    displayLink = CADisplayLink(target: frameTarget, selector: #selector(ExposureFrameTarget.tick))
    displayLink?.add(to: .main, forMode: .common)
  }

  private func sample(forceInvisible: Bool = false) {
    guard let configuration = config, callback != nil else { return }
    deadline?.invalidate()
    deadline = nil
    let view = target
    let active = !forceInvisible && UIApplication.shared.applicationState == .active &&
      view?.window?.windowScene?.activationState == .foregroundActive &&
      view?.window?.isKeyWindow == true &&
      configuration.enabled && configuration.active
    let percent = active ? view.map(ExposureViewability.visiblePercent(of:)) ?? 0 : 0
    let now = ProcessInfo.processInfo.systemUptime
    let (visible, remaining) = tracker.update(percent: percent,
      threshold: configuration.visiblePercentThreshold,
      minimumViewTime: configuration.minimumViewTime, now: now)
    if visible != isViewable {
      isViewable = visible
      emit(visible, percent: percent)
    }
    if let remaining {
      let expected = session
      deadline = Timer.scheduledTimer(withTimeInterval: max(0.001, remaining), repeats: false) { [weak self] _ in
        guard let self, self.session == expected else { return }
        self.sample()
      }
    }
  }

  private func emit(_ visible: Bool, percent: Double, error: String? = nil) {
    guard let config, let callback else { return }
    callback(ExposureEvent(key: config.key, epoch: config.epoch,
      isViewable: visible, visiblePercent: percent,
      timestamp: ProcessInfo.processInfo.systemUptime * 1000, error: error))
  }

  private func releaseBindings() {
    displayLink?.invalidate(); displayLink = nil
    frameTarget.onFrame = nil
    deadline?.invalidate(); deadline = nil
    resolution?.cancel(); resolution = nil
    notifications.forEach { NotificationCenter.default.removeObserver($0) }
    notifications.removeAll()
    target = nil
    tracker.reset()
  }

  private func clear() {
    releaseBindings()
    session += 1
    callback = nil
    config = nil
    isViewable = false
    tag = 0
  }
}
