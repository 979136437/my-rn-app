import UIKit
import NitroViewability

private final class ListCell: UICollectionViewCell {
  var slotId = ""
  var token = 0.0
  var key = ""
  override func prepareForReuse() {
    super.prepareForReuse()
    contentView.subviews.forEach { $0.removeFromSuperview() }
  }
}

private final class ListGeometry: UICollectionViewLayout {
  var entries: [[String: Any]] = []
  var config: [String: Any] = [:]
  var measured: [String: CGFloat] = [:]
  private(set) var frames: [CGRect] = []
  private var prefixBottom: [CGFloat] = []
  private var content = CGSize.zero

  private func number(_ key: String, _ fallback: CGFloat = 0) -> CGFloat {
    CGFloat((config[key] as? NSNumber)?.doubleValue ?? Double(fallback))
  }

  override func prepare() {
    guard let collectionView else { return }
    let width = collectionView.bounds.width
    let left = number("paddingLeft"), right = number("paddingRight")
    let top = number("paddingTop"), bottom = number("paddingBottom")
    let masonry = (config["layout"] as? String) == "masonry"
    let columns = masonry ? max(1, Int(number("numColumns", 1))) : 1
    let gap = number("gap")
    let cellWidth = max(1, (width - left - right - CGFloat(columns - 1) * gap) / CGFloat(columns))
    var bottoms = Array(repeating: top, count: columns)
    var result: [CGRect] = []
    var maxBottom: [CGFloat] = []
    result.reserveCapacity(entries.count)
    for entry in entries {
      let full = !masonry || (entry["fullSpan"] as? Bool ?? false)
      let column = full ? 0 : (bottoms.enumerated().min { $0.element < $1.element }?.offset ?? 0)
      let y = full ? (bottoms.max() ?? top) : bottoms[column]
      let itemWidth = full ? max(1, width - left - right) : cellWidth
      let key = entry["key"] as? String ?? ""
      let version = (entry["version"] as? NSNumber)?.doubleValue ?? 0
      let sizeKey = "\(key):\(version):\(Int(itemWidth.rounded()))"
      let height = max(1, measured[sizeKey] ?? number("estimatedItemSize", 160))
      let frame = CGRect(x: left + CGFloat(column) * (cellWidth + gap), y: y, width: itemWidth, height: height)
      result.append(frame)
      maxBottom.append(max(maxBottom.last ?? 0, frame.maxY))
      if full { bottoms = Array(repeating: y + height + gap, count: columns) }
      else { bottoms[column] = y + height + gap }
    }
    frames = result
    prefixBottom = maxBottom
    content = CGSize(width: width, height: max(top + bottom, (bottoms.max() ?? top) - (entries.isEmpty ? 0 : gap) + bottom))
  }

  override var collectionViewContentSize: CGSize { content }
  override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
    guard frames.indices.contains(indexPath.item) else { return nil }
    let value = UICollectionViewLayoutAttributes(forCellWith: indexPath)
    value.frame = frames[indexPath.item]
    return value
  }
  override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
    visibleIndices(in: rect).compactMap { layoutAttributesForItem(at: IndexPath(item: $0, section: 0)) }
  }
  func visibleIndices(in rect: CGRect) -> [Int] {
    var low = 0, high = prefixBottom.count
    while low < high {
      let mid = (low + high) / 2
      if prefixBottom[mid] < rect.minY { low = mid + 1 } else { high = mid }
    }
    var result: [Int] = []
    var index = low
    while index < frames.count && frames[index].minY <= rect.maxY {
      if frames[index].intersects(rect) { result.append(index) }
      index += 1
    }
    return result
  }
  override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
    newBounds.width != collectionView?.bounds.width
  }
}

@objc(NitroListSurface)
final class NitroListSurface: UIView, NitroListNativeView, UICollectionViewDataSource, UICollectionViewDelegate, UIScrollViewDelegate {
  @objc weak var snapshotSink: (any NitroListSnapshotSink)? { didSet { publishSnapshot() } }
  @objc weak var eventDelegate: (any NitroListSurfaceDelegate)?

  private let geometry = ListGeometry()
  private lazy var collection = UICollectionView(frame: .zero, collectionViewLayout: geometry)
  private let fixedHost = UIView()
  private let refreshHost = UIView()
  private var config: [String: Any] = [:]
  private var entries: [[String: Any]] = []
  private var stickyIndices: [Int] = []
  private var bindings: [String: [String: Any]] = [:]
  private var mountedSlots: [String: UIView] = [:]
  private var mountedTokens: [String: Double] = [:]
  private var cells: [String: ListCell] = [:]
  private var registeredTypes: Set<String> = []
  private var stickyHosts: [Int: UIView] = [:]
  private var stickyKeys: [Int: String] = [:]
  private var stickySlotIds: [Int: String] = [:]
  private var nextSlot = 0
  private var nextToken = 0.0
  private var createdCells = 0.0
  private var rebinds = 0.0
  private var snapshotScheduled = false
  private var refreshing = false
  private var awaitingRefresh = false
  private var refreshSequence = 0
  private var refreshState = "idle"
  private var scrollState = "idle"
  private var interacted = false
  private var endLatched = false
  private var pendingEnd: Double?
  private var endSequence = 0.0
  private var endTail = ""
  private var lastScrollEmit = 0.0
  private var lastOffset: CGFloat = 0
  private var pendingSeek: (key: String, align: String, offset: Double, avoidHeaders: Bool, deadline: TimeInterval)?
  private var visibility: [String: ExposureDwellTracker] = [:]
  private var publishedVisible: [String] = []
  private var visibilityEpoch = -1.0
  private var publishedFirstVisible = false
  private var dwellTimer: Timer?
  private var lifecycleObservers: [NSObjectProtocol] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
    collection.dataSource = self
    collection.delegate = self
    collection.backgroundColor = .clear
    collection.alwaysBounceVertical = true
    collection.contentInsetAdjustmentBehavior = .never
    addSubview(collection)
    addSubview(refreshHost)
    addSubview(fixedHost)
    refreshHost.clipsToBounds = true
    lifecycleObservers = [
      NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
        self?.resetObservation(emitExit: true)
      },
      NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
        self?.resetObservation(emitExit: true)
        self?.dwellTimer?.invalidate(); self?.dwellTimer = nil
      },
      NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.observe() },
      NotificationCenter.default.addObserver(forName: UIScene.willDeactivateNotification, object: nil, queue: .main) { [weak self] notice in
        guard let self, let scene = notice.object as? UIWindowScene, scene === self.window?.windowScene else { return }
        self.resetObservation(emitExit: true)
      },
      NotificationCenter.default.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] notice in
        guard let self, let scene = notice.object as? UIWindowScene, scene === self.window?.windowScene else { return }
        self.observe()
      },
    ]
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
  deinit {
    dwellTimer?.invalidate()
    lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
  }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { resetObservation(emitExit: true) }
    observe()
  }

  private func d(_ key: String, _ fallback: Double = 0) -> Double {
    (config[key] as? NSNumber)?.doubleValue ?? fallback
  }
  private func b(_ key: String) -> Bool { (config[key] as? NSNumber)?.boolValue ?? false }
  private func s(_ key: String, _ fallback: String = "") -> String { config[key] as? String ?? fallback }
  private func event(_ name: String, _ data: [String: Any]) { eventDelegate?.emitListEvent(name, payload: data) }

  override func layoutSubviews() {
    super.layoutSubviews()
    let oldWidth = collection.bounds.width
    let header = CGFloat(d("fixedHeaderHeight"))
    let inset = s("fixedHeaderMode", "inset") == "inset" ? header : 0
    collection.frame = CGRect(x: 0, y: inset, width: bounds.width, height: max(0, bounds.height - inset))
    fixedHost.frame = CGRect(x: 0, y: 0, width: bounds.width, height: header)
    refreshHost.frame = CGRect(x: 0, y: inset - CGFloat(d("refreshHeaderHeight", 64)), width: bounds.width, height: CGFloat(d("refreshHeaderHeight", 64)))
    if oldWidth != collection.bounds.width { geometry.invalidateLayout(); collection.reloadData() }
    positionAccessories()
    updateSticky()
    correctSeek()
    checkEnd()
    observe()
  }

  @objc func configureList(_ next: [String: Any]) {
    let oldEpoch = d("viewabilityEpoch", -1)
    let wasObserving = b("viewabilityEnabled")
    config = next
    geometry.config = next
    if wasObserving && !b("viewabilityEnabled") { resetObservation(emitExit: true) }
    if d("viewabilityEpoch", -1) != oldEpoch {
      visibility.removeAll(); publishedVisible = []; visibilityEpoch = -1; publishedFirstVisible = false; interacted = false
    }
    geometry.invalidateLayout()
    collection.reloadData()
    setNeedsLayout()
    emitMetrics()
  }

  @objc func setListItems(_ items: [[String: Any]]) {
    let oldIndex = collection.indexPathsForVisibleItems.min()?.item
    let oldKey = oldIndex.flatMap { entries.indices.contains($0) ? entries[$0]["key"] as? String : nil }
    let oldY = oldKey.flatMap { key -> CGFloat? in
      guard let index = entries.firstIndex(where: { ($0["key"] as? String) == key }), geometry.frames.indices.contains(index) else { return nil }
      return geometry.frames[index].minY - collection.contentOffset.y
    }
    entries = items
    stickyIndices = items.indices.filter { (items[$0]["stickyGroup"] as? String ?? "") != "" }
    geometry.entries = items
    geometry.invalidateLayout()
    collection.reloadData()
    collection.layoutIfNeeded()
    if let key = oldKey, let index = items.firstIndex(where: { ($0["key"] as? String) == key }), let oldY,
       geometry.frames.indices.contains(index) {
      let target = geometry.frames[index].minY - oldY
      collection.setContentOffset(CGPoint(x: 0, y: min(max(0, target), maxOffset)), animated: false)
    }
    visibility.removeAll(); publishedVisible = []; visibilityEpoch = -1; publishedFirstVisible = false
    let nextTail = entries.last(where: { ($0["role"] as? String) == "item" })?["key"] as? String ?? ""
    if nextTail != endTail { endLatched = false; endTail = nextTail }
    updateSticky(); observe(); checkEnd(); emitMetrics()
  }

  @objc func setListRefreshing(_ value: Bool) {
    refreshing = value
    awaitingRefresh = false
    setRefreshState(value ? "refreshing" : "idle")
    if !value { collection.setContentOffset(CGPoint(x: 0, y: max(0, collection.contentOffset.y)), animated: true) }
  }

  @objc func resolveEndReached(_ requestId: Double, accepted: Bool) {
    guard pendingEnd == requestId else { return }
    pendingEnd = nil
    endLatched = accepted
  }

  @objc func reportMeasurement(_ slotId: String, token: Double, version: Double, width: Double, height: Double) {
    guard let binding = bindings[slotId], (binding["token"] as? Double) == token,
          (binding["version"] as? Double) == version, width > 0, height >= 0 else { return }
    let key = binding["key"] as? String ?? ""
    let sizeKey = "\(key):\(version):\(Int(width.rounded()))"
    let next = CGFloat(max(1, height))
    if let old = geometry.measured[sizeKey], abs(old - next) < 0.5 { return }
    geometry.measured[sizeKey] = next
    let anchor = collection.indexPathsForVisibleItems.min()?.item ?? 0
    let before = geometry.frames.indices.contains(anchor) ? geometry.frames[anchor].minY : 0
    geometry.invalidateLayout(); collection.collectionViewLayout.prepare()
    let after = geometry.frames.indices.contains(anchor) ? geometry.frames[anchor].minY : before
    if anchor > 0, !collection.isDragging { collection.contentOffset.y += after - before }
    collection.collectionViewLayout.invalidateLayout()
    correctSeek()
    updateSticky(); checkEnd(); observe(); emitMetrics()
  }

  @objc func mountSlot(_ view: UIView, slotId: String, accessoryRole: String, token: Double, version: Double) {
    mountedSlots[slotId] = view
    mountedTokens[slotId] = token
    if accessoryRole == "fixed" { fixedHost.addSubview(view); view.frame.origin = .zero }
    else if accessoryRole == "refresh" { refreshHost.addSubview(view); view.frame.origin = .zero }
    else if slotId.hasPrefix("sticky-level-") {
      let levelText = String(slotId.dropFirst("sticky-level-".count).split(separator: ":", maxSplits: 1).first ?? "")
      if let level = Int(levelText), stickySlotIds[level] == slotId, let host = stickyHosts[level] {
        host.addSubview(view); view.frame = host.bounds
      }
    } else { attachSlot(slotId) }
  }
  @objc func unmountSlot(_ view: UIView, slotId: String) {
    if mountedSlots[slotId] === view { mountedSlots.removeValue(forKey: slotId); mountedTokens.removeValue(forKey: slotId) }
    view.removeFromSuperview()
  }
  private func attachSlot(_ slotId: String) {
    guard let cell = cells[slotId], let slot = mountedSlots[slotId], let binding = bindings[slotId] else { return }
    cell.contentView.addSubview(slot)
    slot.frame = cell.contentView.bounds
    slot.isHidden = (binding["token"] as? Double) != cell.token || mountedTokens[slotId] != cell.token
  }
  private func positionAccessories() {
    if let view = mountedSlots["fixed-header"] { view.frame.origin = .zero }
    if let view = mountedSlots["refresh-header"] { view.frame.origin = .zero }
    let pull = max(0, -collection.contentOffset.y)
    refreshHost.frame.origin.y = collection.frame.minY - refreshHost.frame.height + min(pull, refreshHost.frame.height)
  }

  private func updateSticky() {
    guard !geometry.frames.isEmpty else {
      for host in stickyHosts.values { host.isHidden = true }
      return
    }
    let sticky = stickyIndices.filter { geometry.frames.indices.contains($0) }
    let levels = Set(sticky.map { Int((entries[$0]["stickyLevel"] as? NSNumber)?.intValue ?? 0) }).union(stickyKeys.keys)
    var top = CGFloat(s("stickyHeaderAnchor", "headerBottom") == "headerBottom" ? d("fixedHeaderHeight") : 0)
      + CGFloat(d("stickyHeaderOffset"))
    if b("stickyHeaderFollowRefresh") { top += max(0, -collection.contentOffset.y) }
    for level in levels.sorted() {
      let indices = sticky.filter { Int((entries[$0]["stickyLevel"] as? NSNumber)?.intValue ?? 0) == level }
      let boundary = collection.contentOffset.y + top - collection.frame.minY
      let candidate = indices.last { geometry.frames[$0].minY <= boundary }
      let oldSlotId = stickySlotIds[level] ?? ""
      let oldKey = stickyKeys[level] ?? ""
      guard let index = candidate else {
        if !oldKey.isEmpty {
          stickyKeys.removeValue(forKey: level)
          if var binding = bindings[oldSlotId] { binding["active"] = false; bindings[oldSlotId] = binding; publishSnapshot() }
          stickyHosts[level]?.isHidden = true
          event("onStickyHeaderChange", ["group": indices.first.map { entries[$0]["stickyGroup"] ?? "" } ?? "",
                                         "level": level, "previousKey": oldKey, "key": ""])
        }
        continue
      }
      let entry = entries[index]
      let key = entry["key"] as? String ?? ""
      let type = entry["type"] as? String ?? ""
      let slotId = "sticky-level-\(level):\(type)"
      let height = geometry.frames[index].height
      let endKey = entry["stickyEndKey"] as? String ?? ""
      let ended = !endKey.isEmpty && entries.firstIndex(where: { ($0["key"] as? String) == endKey }).map {
        geometry.frames.indices.contains($0) && geometry.frames[$0].minY <= boundary
      } == true
      if ended {
        stickyHosts[level]?.isHidden = true
        if !oldKey.isEmpty {
          stickyKeys.removeValue(forKey: level)
          if var binding = bindings[oldSlotId] { binding["active"] = false; bindings[oldSlotId] = binding; publishSnapshot() }
          event("onStickyHeaderChange", ["group": entry["stickyGroup"] ?? "", "level": level,
                                         "previousKey": oldKey, "key": ""])
        }
        continue
      }
      let host = stickyHosts[level] ?? UIView()
      if stickyHosts[level] == nil { stickyHosts[level] = host; host.clipsToBounds = true; addSubview(host) }
      host.isHidden = false
      var y = top
      if (entry["stickyTransition"] as? String ?? "push") == "push",
         let next = indices.first(where: { $0 > index }) {
        y = min(y, collection.frame.minY + geometry.frames[next].minY - collection.contentOffset.y - height)
      }
      host.frame = CGRect(x: geometry.frames[index].minX, y: y, width: geometry.frames[index].width, height: height)
      mountedSlots[slotId]?.frame = host.bounds
      let version = (entry["version"] as? NSNumber)?.doubleValue ?? 0
      let needsBind = oldKey != key || oldSlotId != slotId || (bindings[slotId]?["version"] as? Double) != version
      if needsBind {
        stickyKeys[level] = key
        stickySlotIds[level] = slotId
        if oldSlotId != slotId, var old = bindings[oldSlotId] {
          old["active"] = false; bindings[oldSlotId] = old
          mountedSlots[oldSlotId]?.isHidden = true
        }
        nextToken += 1
        if oldKey.isEmpty { createdCells += 1 } else { rebinds += 1 }
        bindings[slotId] = ["slotId": slotId, "key": key, "index": Double(index),
                            "type": type, "token": nextToken,
                            "version": version, "active": true]
        mountedSlots[slotId]?.isHidden = true
        publishSnapshot()
        if oldKey != key {
          event("onStickyHeaderChange", ["group": entry["stickyGroup"] ?? "", "level": level,
                                         "previousKey": oldKey, "key": key])
        }
      } else if let slot = mountedSlots[slotId] {
        slot.isHidden = mountedTokens[slotId] != (bindings[slotId]?["token"] as? Double)
      }
      top = max(top, y + height)
    }
  }

  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int { entries.count }
  func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
    let entry = entries[indexPath.item]
    let type = entry["type"] as? String ?? ""
    let reuseId = "list:\(type)"
    if registeredTypes.insert(reuseId).inserted { collectionView.register(ListCell.self, forCellWithReuseIdentifier: reuseId) }
    let cell = collectionView.dequeueReusableCell(withReuseIdentifier: reuseId, for: indexPath) as! ListCell
    if cell.slotId.isEmpty { nextSlot += 1; createdCells += 1; cell.slotId = "ios-slot-\(nextSlot)" }
    let key = entry["key"] as? String ?? ""
    if !cell.key.isEmpty && cell.key != key { rebinds += 1 }
    cell.key = key
    nextToken += 1
    cell.token = nextToken
    let slotId = cell.slotId
    bindings[slotId] = ["slotId": slotId, "key": key, "index": Double(indexPath.item),
                        "type": type, "token": cell.token,
                        "version": (entry["version"] as? NSNumber)?.doubleValue ?? 0, "active": true]
    cells[slotId] = cell
    attachSlot(slotId)
    publishSnapshot()
    return cell
  }
  func collectionView(_ collectionView: UICollectionView, didEndDisplaying cell: UICollectionViewCell, forItemAt indexPath: IndexPath) {
    guard let cell = cell as? ListCell, var binding = bindings[cell.slotId],
          (binding["index"] as? Double) == Double(indexPath.item),
          (binding["token"] as? Double) == cell.token else { return }
    binding["active"] = false
    bindings[cell.slotId] = binding
    cells.removeValue(forKey: cell.slotId)
    publishSnapshot()
  }
  private func publishSnapshot() {
    guard !snapshotScheduled else { return }
    snapshotScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.snapshotScheduled = false
      let all = self.bindings.values.sorted { ($0["slotId"] as? String ?? "") < ($1["slotId"] as? String ?? "") }
      self.snapshotSink?.publishSnapshot(all, createdCells: self.createdCells, rebinds: self.rebinds)
    }
  }

  private var maxOffset: CGFloat { max(0, collection.contentSize.height - collection.bounds.height) }
  @objc func scrollToOffset(_ offset: Double, animated: Bool) {
    let target = min(max(0, CGFloat(offset)), maxOffset)
    if animated && abs(target - collection.contentOffset.y) > 0.5 { setScrollState("settling") }
    collection.setContentOffset(CGPoint(x: 0, y: target), animated: animated)
  }
  @objc func scrollToEnd(_ animated: Bool) { scrollToOffset(Double(maxOffset), animated: animated) }
  @objc func scrollBy(_ delta: Double, animated: Bool) { scrollToOffset(Double(collection.contentOffset.y) + delta, animated: animated) }
  @objc func scrollToItem(_ key: String, animated: Bool, align: String, offset: Double, avoidHeaders: Bool) {
    collection.layoutIfNeeded()
    guard let index = entries.firstIndex(where: { ($0["key"] as? String) == key }), geometry.frames.indices.contains(index) else {
      event("onScrollToItemFailed", ["key": key, "reason": "invalid-target"])
      return
    }
    pendingSeek = (key, align, offset, avoidHeaders, ProcessInfo.processInfo.systemUptime + 2)
    let frame = geometry.frames[index]
    let free = max(0, collection.bounds.height - frame.height)
    let adjustment: CGFloat = align == "center" ? free / 2 : align == "end" ? free : 0
    let header = avoidHeaders ? CGFloat(d("fixedHeaderHeight")) : 0
    scrollToOffset(Double(frame.minY - adjustment - header + CGFloat(offset)), animated: animated)
  }
  private func correctSeek() {
    guard let seek = pendingSeek else { return }
    guard ProcessInfo.processInfo.systemUptime < seek.deadline else {
      pendingSeek = nil
      event("onScrollToItemFailed", ["key": seek.key, "reason": "layout-timeout"])
      return
    }
    guard let index = entries.firstIndex(where: { ($0["key"] as? String) == seek.key }), geometry.frames.indices.contains(index) else {
      pendingSeek = nil
      event("onScrollToItemFailed", ["key": seek.key, "reason": "invalid-target"])
      return
    }
    let frame = geometry.frames[index]
    let width = Int(frame.width.rounded())
    let version = (entries[index]["version"] as? NSNumber)?.doubleValue ?? 0
    let measured = geometry.measured["\(seek.key):\(version):\(width)"] != nil
    let free = max(0, collection.bounds.height - frame.height)
    let adjustment: CGFloat = seek.align == "center" ? free / 2 : seek.align == "end" ? free : 0
    let header = seek.avoidHeaders ? CGFloat(d("fixedHeaderHeight")) : 0
    let desired = min(max(0, frame.minY - adjustment - header + CGFloat(seek.offset)), maxOffset)
    if abs(collection.contentOffset.y - desired) > 1 { collection.setContentOffset(CGPoint(x: 0, y: desired), animated: false) }
    if measured { pendingSeek = nil }
  }
  @objc func stopScroll() {
    pendingSeek = nil
    collection.setContentOffset(collection.contentOffset, animated: false)
    setScrollState("idle")
  }

  @objc func scrollMetrics() -> [String: Any] {
    let offset = Double(max(0, collection.contentOffset.y))
    let maxY = Double(maxOffset)
    return ["offsetY": offset, "pullDistance": Double(max(0, -collection.contentOffset.y)),
            "viewportHeight": Double(collection.bounds.height), "contentHeight": Double(collection.contentSize.height),
            "maxOffsetY": maxY, "scrollState": scrollState, "isAtStart": offset <= 0.5,
            "isAtEnd": offset >= maxY - 0.5, "headerBottom": Double(fixedHost.frame.maxY),
            "stickyTop": Double(fixedHost.frame.maxY + CGFloat(d("stickyHeaderOffset"))),
            "isOffsetEstimated": false, "isContentSizeEstimated": geometry.measured.count < entries.count,
            "timestamp": Date().timeIntervalSince1970 * 1000]
  }

  private func scrollPayload() -> [String: Any] {
    ["offsetY": Double(max(0, collection.contentOffset.y)), "viewportWidth": Double(collection.bounds.width),
     "viewportHeight": Double(collection.bounds.height), "contentHeight": Double(collection.contentSize.height),
     "state": scrollState, "previousState": scrollState, "timestamp": Date().timeIntervalSince1970 * 1000]
  }
  private func setScrollState(_ next: String) {
    guard next != scrollState else { return }
    let previous = scrollState
    scrollState = next
    var payload = scrollPayload(); payload["previousState"] = previous
    event("onListScrollStateChange", payload)
    emitMetrics()
  }
  private func emitMetrics() { if b("metricsEnabled") { event("onScrollMetrics", scrollMetrics()) } }
  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) { interacted = true; setScrollState("dragging") }
  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    requestRefreshIfReady()
    setScrollState(decelerate ? "settling" : "idle")
  }
  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { setScrollState("idle") }
  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) { setScrollState("idle") }
  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    eventDelegate?.refreshSlotOffsets()
    let dy = collection.contentOffset.y - lastOffset
    lastOffset = collection.contentOffset.y
    if dy < -0.5 && interacted && maxOffset - max(0, collection.contentOffset.y) > collection.bounds.height * CGFloat(d("endReachedThreshold", 0.5)) {
      endLatched = false
    }
    positionAccessories()
    updateSticky()
    let now = Date().timeIntervalSince1970 * 1000
    if b("scrollEventsEnabled") && now - lastScrollEmit >= d("scrollEventThrottle", 16) {
      lastScrollEmit = now; event("onListScroll", scrollPayload())
    }
    let pull = Double(max(0, -collection.contentOffset.y))
    if b("refreshEnabled") && !refreshing && !awaitingRefresh {
      let threshold = d("refreshThreshold", 64)
      let next = pull <= 0 ? "idle" : pull >= threshold ? "ready" : "pulling"
      setRefreshState(next)
      event("onPullProgress", ["distance": pull, "progress": min(1, pull / max(1, threshold))])
    }
    checkEnd(); observe(); emitMetrics()
  }
  private func setRefreshState(_ value: String) {
    guard value != refreshState else { return }
    refreshState = value
    event("onRefreshStateChange", ["state": value])
  }
  private func requestRefreshIfReady() {
    guard b("refreshEnabled"), refreshState == "ready", !refreshing, !awaitingRefresh else { return }
    awaitingRefresh = true
    refreshSequence += 1
    setRefreshState("refreshing")
    event("onRefreshRequested", ["sequence": refreshSequence])
    let sequence = refreshSequence
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
      guard let self, self.refreshSequence == sequence, self.awaitingRefresh, !self.refreshing else { return }
      self.awaitingRefresh = false
      self.setRefreshState("idle")
    }
  }

  private func checkEnd() {
    guard b("endReachedEnabled"), !refreshing, !endLatched, pendingEnd == nil else { return }
    guard let last = entries.lastIndex(where: { ($0["role"] as? String) == "item" }), last >= 0 else { return }
    let distance = maxOffset - max(0, collection.contentOffset.y)
    if distance <= collection.bounds.height * CGFloat(d("endReachedThreshold", 0.5)) {
      endSequence += 1
      pendingEnd = endSequence
      let data = entries.filter { ($0["role"] as? String) == "item" }
      event("onEndReached", ["dataCount": data.count, "tailKey": data.last?["key"] as? String ?? "",
                              "epoch": d("endReachedEpoch"), "requestId": endSequence])
    } else if interacted && distance > collection.bounds.height * CGFloat(d("endReachedThreshold", 0.5)) {
      endLatched = false
    }
  }

  private func observe() {
    dwellTimer?.invalidate(); dwellTimer = nil
    guard b("viewabilityEnabled"), let window, window.isKeyWindow,
          window.windowScene?.activationState == .foregroundActive,
          !isHidden, alpha > 0, UIApplication.shared.applicationState == .active else { return }
    let epoch = d("viewabilityEpoch")
    if visibilityEpoch != epoch { visibility.removeAll(); publishedVisible = []; visibilityEpoch = epoch; publishedFirstVisible = false }
    let viewport = CGRect(origin: collection.contentOffset, size: collection.bounds.size)
    let now = ProcessInfo.processInfo.systemUptime
    var visible: [String] = []
    var delay: TimeInterval?
    let candidates = geometry.visibleIndices(in: viewport).filter { entries.indices.contains($0) }
    for index in candidates {
      let entry = entries[index]
      guard (entry["role"] as? String) == "item", let key = entry["key"] as? String else { continue }
      let frame = geometry.frames[index]
      let percent = visibleHeightPercent(frame: frame, viewport: viewport)
      let tracker = visibility[key] ?? ExposureDwellTracker()
      visibility[key] = tracker
      let result = tracker.update(percent: percent, threshold: d("itemVisiblePercentThreshold", 50),
                                  minimumViewTime: d("minimumViewTime"), now: now)
      if result.0 && (!b("waitForInteraction") || interacted) { visible.append(key) }
      if let remaining = result.1 { delay = min(delay ?? remaining, remaining) }
    }
    let seen = Set(candidates.compactMap { entries[$0]["key"] as? String })
    for key in visibility.keys where !seen.contains(key) { visibility[key]?.reset() }
    if visible != publishedVisible || !publishedFirstVisible {
      publishedVisible = visible
      publishedFirstVisible = true
      event("onViewableItemsChange", ["epoch": epoch, "items": visible.compactMap { key -> [String: Any]? in
        guard let entry = entries.first(where: { ($0["key"] as? String) == key }) else { return nil }
        return ["key": key, "version": entry["version"] ?? 0]
      }])
    }
    if let delay { dwellTimer = Timer.scheduledTimer(withTimeInterval: max(0.016, delay), repeats: false) { [weak self] _ in self?.observe() } }
  }

  private func resetObservation(emitExit: Bool) {
    dwellTimer?.invalidate(); dwellTimer = nil
    if emitExit && !publishedVisible.isEmpty {
      event("onViewableItemsChange", ["epoch": visibilityEpoch, "items": []])
    }
    visibility.removeAll(); publishedVisible = []; publishedFirstVisible = false
  }

  private func visibleHeightPercent(frame: CGRect, viewport: CGRect) -> Double {
    guard let window else { return 0 }
    let local = frame.intersection(viewport)
    guard !local.isNull, !local.isEmpty else { return 0 }
    var clipped = collection.convert(local, to: window).intersection(window.bounds)
    var ancestor: UIView? = collection
    while let view = ancestor {
      guard !view.isHidden, view.alpha > 0 else { return 0 }
      if view.clipsToBounds || view.layer.masksToBounds {
        clipped = clipped.intersection(view.convert(view.bounds, to: window))
        if clipped.isNull || clipped.isEmpty { return 0 }
      }
      ancestor = view.superview
    }
    return Double(max(0, min(100, clipped.height / max(1, frame.height) * 100)))
  }
}
