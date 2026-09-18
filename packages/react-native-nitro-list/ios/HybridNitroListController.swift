import Foundation
import NitroModules

private final class ListConnection: NSObject, NitroListNativeController, NitroListSnapshotSink {
  weak var owner: HybridNitroListController?
  weak var list: (any NitroListNativeView)?

  init(owner: HybridNitroListController) { self.owner = owner }

  func attachList(_ list: Any) {
    guard let list = list as? any NitroListNativeView else { return }
    self.list?.snapshotSink = nil
    self.list = list
    list.snapshotSink = self
    owner?.replay(to: list)
  }

  func detachList(_ list: Any) {
    guard let current = self.list, (current as AnyObject) === (list as AnyObject) else { return }
    current.snapshotSink = nil
    self.list = nil
  }

  func publishSnapshot(_ slots: [[String: Any]], createdCells: Double, rebinds: Double) {
    owner?.receive(slots: slots, createdCells: createdCells, rebinds: rebinds)
  }
}

final class HybridNitroListController: HybridNitroListControllerSpec {
  private var listId: String?
  private var callback: ((ListSnapshot) -> Void)?
  private var config: [String: Any]?
  private var items: [[String: Any]] = []
  private var refreshing = false
  private var generation = 0
  private var connection: ListConnection?

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }

  func connect(listId: String, onSnapshot: @escaping (ListSnapshot) -> Void) throws {
    guard !listId.isEmpty else { throw NSError(domain: "NitroList", code: 1, userInfo: [NSLocalizedDescriptionKey: "List ID is required"]) }
    generation += 1
    let epoch = generation
    onMain { [weak self] in
      guard let self, self.generation == epoch else { return }
      if let old = self.listId, let connection = self.connection { NitroListBridge.disconnect(connection, listId: old) }
      self.listId = listId
      self.callback = onSnapshot
      let connection = ListConnection(owner: self)
      self.connection = connection
      NitroListBridge.connect(connection, listId: listId)
    }
  }

  func configure(config: ListConfig) throws {
    let next: [String: Any] = [
      "layout": config.layout == .masonry ? "masonry" : "list", "numColumns": config.numColumns,
      "gap": config.gap, "estimatedItemSize": config.estimatedItemSize,
      "refreshEnabled": config.refreshEnabled, "refreshHeaderHeight": config.refreshHeaderHeight,
      "refreshThreshold": config.refreshThreshold, "paddingTop": config.paddingTop,
      "paddingRight": config.paddingRight, "paddingBottom": config.paddingBottom,
      "paddingLeft": config.paddingLeft, "endReachedEnabled": config.endReachedEnabled,
      "endReachedThreshold": config.endReachedThreshold, "endReachedEpoch": config.endReachedEpoch,
      "scrollEventsEnabled": config.scrollEventsEnabled, "scrollEventThrottle": config.scrollEventThrottle,
      "viewabilityEnabled": config.viewabilityEnabled, "itemVisiblePercentThreshold": config.itemVisiblePercentThreshold,
      "minimumViewTime": config.minimumViewTime, "waitForInteraction": config.waitForInteraction,
      "viewabilityEpoch": config.viewabilityEpoch, "fixedHeaderHeight": config.fixedHeaderHeight,
      "fixedHeaderMode": config.fixedHeaderMode, "refreshPlacement": config.refreshPlacement,
      "refreshRevealMode": config.refreshRevealMode, "refreshOffset": config.refreshOffset,
      "stickyHeaderAnchor": config.stickyHeaderAnchor, "stickyHeaderOffset": config.stickyHeaderOffset,
      "stickyHeaderFollowRefresh": config.stickyHeaderFollowRefresh, "metricsEnabled": config.metricsEnabled,
    ]
    onMain { [weak self] in self?.config = next; self?.connection?.list?.configureList(next) }
  }

  func setItems(items: [ListItem]) throws {
    let next = items.map { item -> [String: Any] in [
      "key": item.key, "type": item.type, "version": item.version, "fullSpan": item.fullSpan,
      "role": item.role, "stickyGroup": item.stickyGroup, "stickyLevel": item.stickyLevel,
      "stickyTransition": item.stickyTransition, "stickyEndKey": item.stickyEndKey,
    ] }
    guard Set(next.compactMap { $0["key"] as? String }).count == next.count else {
      throw NSError(domain: "NitroList", code: 2, userInfo: [NSLocalizedDescriptionKey: "Item keys must be unique"])
    }
    onMain { [weak self] in self?.items = next; self?.connection?.list?.setListItems(next) }
  }

  func setRefreshing(refreshing: Bool) throws {
    onMain { [weak self] in self?.refreshing = refreshing; self?.connection?.list?.setListRefreshing(refreshing) }
  }

  func resolveEndReached(requestId: Double, accepted: Bool) throws {
    onMain { [weak self] in self?.connection?.list?.resolveEndReached(requestId, accepted: accepted) }
  }

  func reportMeasurement(slotId: String, token: Double, version: Double, width: Double, height: Double) throws {
    onMain { [weak self] in self?.connection?.list?.reportMeasurement(slotId, token: token, version: version, width: width, height: height) }
  }

  func scrollToOffset(offset: Double, animated: Bool) throws {
    guard offset.isFinite else { throw NSError(domain: "NitroList", code: 3) }
    onMain { [weak self] in self?.connection?.list?.scrollToOffset(offset, animated: animated) }
  }

  func scrollToEnd(animated: Bool) throws { onMain { [weak self] in self?.connection?.list?.scrollToEnd(animated) } }
  func scrollBy(deltaY: Double, animated: Bool) throws {
    guard deltaY.isFinite else { throw NSError(domain: "NitroList", code: 3) }
    onMain { [weak self] in self?.connection?.list?.scrollBy(deltaY, animated: animated) }
  }

  func scrollToItem(key: String, animated: Bool, align: String, offset: Double, avoidHeaders: Bool) throws {
    guard offset.isFinite, ["start", "center", "end"].contains(align) else { throw NSError(domain: "NitroList", code: 3) }
    onMain { [weak self] in self?.connection?.list?.scrollToItem(key, animated: animated, align: align, offset: offset, avoidHeaders: avoidHeaders) }
  }

  func stopScroll() throws { onMain { [weak self] in self?.connection?.list?.stopScroll() } }

  func getScrollMetrics() throws -> Promise<ScrollMetrics> {
    let result = Promise<ScrollMetrics>()
    onMain { [weak self] in
      guard let raw = self?.connection?.list?.scrollMetrics() else {
        result.reject(withError: NSError(domain: "NitroList", code: 4, userInfo: [NSLocalizedDescriptionKey: "List is not connected"]))
        return
      }
      func d(_ key: String) -> Double { (raw[key] as? NSNumber)?.doubleValue ?? 0 }
      func b(_ key: String) -> Bool { (raw[key] as? NSNumber)?.boolValue ?? false }
      result.resolve(withResult: ScrollMetrics(offsetY: d("offsetY"), pullDistance: d("pullDistance"),
        viewportHeight: d("viewportHeight"), contentHeight: d("contentHeight"), maxOffsetY: d("maxOffsetY"),
        scrollState: raw["scrollState"] as? String ?? "idle", isAtStart: b("isAtStart"), isAtEnd: b("isAtEnd"),
        headerBottom: d("headerBottom"), stickyTop: d("stickyTop"), isOffsetEstimated: b("isOffsetEstimated"),
        isContentSizeEstimated: b("isContentSizeEstimated"), timestamp: d("timestamp")))
    }
    return result
  }

  func disconnect() throws {
    generation += 1
    let epoch = generation
    onMain { [weak self] in
      guard let self, self.generation == epoch else { return }
      if let id = self.listId, let connection = self.connection { NitroListBridge.disconnect(connection, listId: id) }
      self.listId = nil; self.connection = nil; self.callback = nil; self.items = []; self.config = nil
    }
  }

  fileprivate func replay(to list: any NitroListNativeView) {
    if let config { list.configureList(config) }
    list.setListItems(items)
    list.setListRefreshing(refreshing)
  }

  fileprivate func receive(slots: [[String: Any]], createdCells: Double, rebinds: Double) {
    let bindings = slots.map { slot in
      SlotBinding(slotId: slot["slotId"] as? String ?? "", key: slot["key"] as? String ?? "",
        index: (slot["index"] as? NSNumber)?.doubleValue ?? 0, type: slot["type"] as? String ?? "",
        token: (slot["token"] as? NSNumber)?.doubleValue ?? 0, version: (slot["version"] as? NSNumber)?.doubleValue ?? 0,
        active: (slot["active"] as? NSNumber)?.boolValue ?? false)
    }
    callback?(ListSnapshot(slots: bindings, createdCells: createdCells, rebinds: rebinds))
  }
}
