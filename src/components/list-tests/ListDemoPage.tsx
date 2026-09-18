import Constants, { ExecutionEnvironment } from "expo-constants";
import { Image } from "expo-image";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeList, useRecyclingState, type NativeListDiagnostics, type NativeListProps, type NativeListRef, type NativeListScrollInfo, type RefreshHeaderInfo } from "react-native-nitro-list";
import { ExposureObserver, useExposureObserver, type ExposureInfo } from "react-native-nitro-viewability";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Item = { id: string; number: number; kind: "photo" | "note"; title: string };
const EMPTY_DIAGNOSTICS: NativeListDiagnostics = { createdCells: 0, rebinds: 0, mountedSlots: 0, activeSlots: 0, reactMounts: 0 };
const createItems = (count: number, start = 0): Item[] => Array.from({ length: count }, (_, offset) => {
  const index = start + offset;
  return ({
  id: `item-${index}`,
  number: index,
  kind: index % 3 === 0 ? "note" : "photo",
  title: ["山野之间", "今天也慢一点", "看见城市的另一面", "收集一点日常"][index % 4],
  });
});
const keyExtractor = (item: Item) => item.id;
const getItemType = (item: Item) => item.kind;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50, minimumViewTime: 300, waitForInteraction: false };
type ObservationHandle = {
  onScroll: (info: NativeListScrollInfo) => void;
  onViewableItemsChanged: NonNullable<NativeListProps<Item>["onViewableItemsChanged"]>;
  onExposure: (info: ExposureInfo) => void;
  onVisibilityChange: (info: ExposureInfo) => void;
};

// Keep frequent observation updates out of the list owner's render path so
// scroll events do not invalidate accessory elements or item measurements.
function ObservationPanel({ ref }: { ref: Ref<ObservationHandle> }) {
  const [scroll, setScroll] = useState({ state: "idle", y: 0 });
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [exposureCounts, setExposureCounts] = useState<Record<string, number>>({});
  const [exposures, setExposures] = useState<Record<string, ExposureInfo>>({});
  useImperativeHandle<ObservationHandle, ObservationHandle>(ref, () => ({
    onScroll: info => {
      const y = Math.round(info.contentOffset.y);
      setScroll(previous => previous.state === info.state && previous.y === y ? previous : { state: info.state, y });
    },
    onViewableItemsChanged: ({ viewableItems }) => setVisibleKeys(viewableItems.map(token => token.key)),
    onExposure: info => setExposureCounts(values => ({ ...values, [info.key]: (values[info.key] ?? 0) + 1 })),
    onVisibilityChange: info => setExposures(values => ({ ...values, [info.key]: info })),
  }), []);
  return <View style={styles.observations}>
    <Text style={styles.diagnosticsText}>滚动 {scroll.state} · y ≈ {scroll.y} dp · 采样 120 ms</Text>
    <Text style={styles.diagnosticsText} numberOfLines={1}>可见 {visibleKeys.length} · {visibleKeys.length ? visibleKeys.join(", ") : "暂无（≥ 50%，持续 300 ms）"}</Text>
    {[["demo-ad-card", "包装广告"], ["demo-expand-header", "Hook 按钮"]].map(([key, label]) =>
      <Text key={key} style={styles.diagnosticsText}>{label}曝光 {exposureCounts[key] ?? 0} 次 · {exposures[key]?.isViewable ? "已满足" : "未满足"} · 面积 ≥ 50% / 300 ms</Text>)}
  </View>;
}

function Choice({ label, active = false, onPress, nativeRef }: { label: string; active?: boolean; onPress: () => void; nativeRef?: Ref<View> }) {
  return <Pressable ref={nativeRef} collapsable={false} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && styles.pressed]}>
    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
  </Pressable>;
}

function ObservedHeaderButton({ expanded, active, onPress, onExposure, onVisibilityChange }: {
  expanded: boolean;
  active: boolean;
  onPress: () => void;
  onExposure: (info: ExposureInfo) => void;
  onVisibilityChange: (info: ExposureInfo) => void;
}) {
  const observerRef = useExposureObserver({
    exposureKey: "demo-expand-header",
    visiblePercentThreshold: 50,
    minimumViewTime: 300,
    active,
    onExposure,
    onVisibilityChange,
  });
  // Choice forwards the ref to its existing native Pressable View; no wrapper.
  return <Choice nativeRef={observerRef} label={expanded ? "收起头部" : "展开头部"} onPress={onPress} />;
}

function RefreshHeader({ state, progress }: RefreshHeaderInfo) {
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, 0.25 + progress.value * 0.75),
    transform: [{ rotate: `${Math.min(progress.value, 1) * 180}deg` }, { scale: 0.75 + Math.min(progress.value, 1) * 0.25 }],
  }));
  const label = { idle: "下拉，发现新内容", pulling: "继续下拉", ready: "松开刷新", refreshing: "正在刷新…", settling: "刷新完成" }[state];
  return <View style={styles.refreshHeader}>
    <Animated.Text style={[styles.refreshIcon, indicatorStyle]}>↓</Animated.Text>
    <Text style={styles.refreshText}>{label}</Text>
  </View>;
}

function Card({ item, favorite, onFavorite }: { item: Item; favorite: boolean; onFavorite: (key: string) => void }) {
  // These values belong to the current item, even when React reuses this Card instance.
  const [expanded, setExpanded] = useRecyclingState(false);
  const [imageFailed, setImageFailed] = useRecyclingState(false);
  const currentKey = useRef(item.id);
  currentKey.current = item.id;
  const imageHeight = 230 + (item.number % 5) * 55;
  // The requested dimensions are known before download. Reserve the final
  // space so loading (including after recycling) does not resize the card.
  const aspectRatio = 480 / imageHeight;
  return <View style={[styles.card, item.kind === "note" && styles.noteCard]}>
    {item.kind === "photo" && <View style={[styles.imageFrame, { aspectRatio }]}>
      <Image
        source={{ uri: `https://picsum.photos/seed/nitro-${item.number}/480/${imageHeight}`, width: 480, height: imageHeight }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={item.id}
        accessibilityLabel={item.title}
        onError={() => { if (currentKey.current === item.id) setImageFailed(true); }}
      />
      {imageFailed && <Text style={styles.imageError}>图片暂不可用</Text>}
    </View>}
    <View style={styles.cardBody}>
      <Text style={styles.cardTag}>{item.kind === "note" ? "随手记" : "影像"} · {item.id}</Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      {item.kind === "note" && <Text style={styles.cardCopy}>不同类型使用独立回收池。快一点滚动，再回来看看。</Text>}
      {expanded && <Text style={styles.cardCopy}>这段内容会改变卡片高度。展开状态使用 useRecyclingState，槽位换绑后重置；收藏按数据 key 存在列表外部，滚出屏幕后仍会保留。</Text>}
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "收起卡片" : "展开卡片"} onPress={() => setExpanded(value => !value)} hitSlop={8}>
          <Text style={styles.actionText}>{expanded ? "收起 ↑" : "展开 ↓"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={favorite ? "取消收藏" : "收藏"} onPress={() => onFavorite(item.id)} hitSlop={8}>
          <Text style={[styles.favorite, favorite && styles.favoriteSelected]}>{favorite ? "♥" : "♡"}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}

export default function ListDemoPage({ title, layout, count }: { title: string; layout: "list" | "masonry"; count: number }) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<NativeListRef>(null);
  const observationRef = useRef<ObservationHandle>(null);
  const observeScroll = useCallback((info: NativeListScrollInfo) => observationRef.current?.onScroll(info), []);
  const observeViewability = useCallback<ObservationHandle["onViewableItemsChanged"]>(info => observationRef.current?.onViewableItemsChanged(info), []);
  const observeExposure = useCallback((info: ExposureInfo) => observationRef.current?.onExposure(info), []);
  const observeVisibility = useCallback((info: ExposureInfo) => observationRef.current?.onVisibilityChange(info), []);
  const [screenFocused, setScreenFocused] = useState(false);
  const [observationActive, setObservationActive] = useState(true);
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => setScreenFocused(false);
  }, []));
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersion = useRef(0);
  const nextItem = useRef(count);
  const failNextPage = useRef(false);
  const sequence = useRef(0);
  const [data, setData] = useState(() => createItems(count));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageError, setPageError] = useState(false);
  const [failureArmed, setFailureArmed] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [footerExpanded, setFooterExpanded] = useState(false);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [diagnostics, setDiagnostics] = useState(EMPTY_DIAGNOSTICS);
  const available = (Platform.OS === "android" || Platform.OS === "ios") && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

  const cancelRequests = useCallback(() => {
    requestVersion.current += 1;
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
    if (pageTimer.current !== null) clearTimeout(pageTimer.current);
    refreshTimer.current = null;
    pageTimer.current = null;
  }, []);
  useEffect(() => cancelRequests, [cancelRequests]);

  const loadMore = useCallback((retry = false) => {
    if (pageTimer.current !== null || refreshTimer.current !== null || !hasMore || (pageError && !retry)) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setPageError(false);
    pageTimer.current = setTimeout(() => {
      if (version !== requestVersion.current) return;
      pageTimer.current = null;
      setLoadingMore(false);
      if (failNextPage.current) {
        failNextPage.current = false;
        setFailureArmed(false);
        setPageError(true);
        return;
      }
      const size = Math.min(12, count + 36 - nextItem.current);
      const page = createItems(size, nextItem.current);
      nextItem.current += size;
      setData(items => [...items, ...page]);
      setHasMore(nextItem.current < count + 36);
    }, 1100);
  }, [count, hasMore, pageError]);

  const addItem = useCallback(() => {
    const id = ++sequence.current;
    setData(items => [{ id: `new-${id}`, number: 10000 + id, kind: "photo", title: "刚刚加入的新风景" }, ...items]);
  }, []);
  const onFavorite = useCallback((key: string) => setFavorites(previous => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), []);
  const onRefresh = useCallback(() => {
    if (refreshTimer.current !== null) return;
    cancelRequests();
    setLoadingMore(false);
    setPageError(false);
    setRefreshing(true);
    const version = requestVersion.current;
    refreshTimer.current = setTimeout(() => {
      if (version !== requestVersion.current) return;
      nextItem.current = count;
      setData(createItems(count));
      setHasMore(true);
      setRefreshing(false);
      refreshTimer.current = null;
    }, 1100);
  }, [cancelRequests, count]);
  const renderItem = useCallback(({ item }: { item: Item }) => <Card item={item} favorite={favorites.has(item.id)} onFavorite={onFavorite} />, [favorites, onFavorite]);
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <Text style={styles.eyebrow}>NITRO LIST / NATIVE PROTOTYPE</Text>
      <Choice label="← 首页目录" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.subtitle}>原生列表 · 分页加载 · 头尾与空状态</Text>
      <View style={styles.diagnostics}>
        <Text style={styles.diagnosticsText}>数据 {data.length} · cell 创建 {diagnostics.createdCells} · 换绑 {diagnostics.rebinds}</Text>
        <Text style={styles.diagnosticsText}>槽位 {diagnostics.mountedSlots} / 活跃 {diagnostics.activeSlots} · React 累计挂载 {diagnostics.reactMounts}</Text>
        <ObservationPanel key={`${layout}-${count}`} ref={observationRef} />
      </View>
      <View style={styles.toolbar}>
        <Choice label="顶部插入" onPress={addItem} />
        <Choice label="删除首项" onPress={() => setData(items => items.slice(1))} />
        <Choice label="回顶部" onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })} />
        <Choice label="到底部" onPress={() => listRef.current?.scrollToEnd({ animated: true })} />
        <Choice label={observationActive ? "暂停普通组件曝光" : "恢复普通组件曝光"} active={observationActive} onPress={() => setObservationActive(value => !value)} />
      </View>
    </View>
    {available ? <NativeList
      key={`${layout}-${count}`}
      ref={listRef}
      style={styles.list}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      extraData={favorites}
      layout={layout}
      numColumns={layout === "masonry" ? 3 : 1}
      gap={12}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
      onEndReached={() => loadMore()}
      onEndReachedThreshold={0.5}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onScroll={observeScroll}
      onScrollStateChange={observeScroll}
      scrollEventThrottle={120}
      viewabilityConfig={VIEWABILITY_CONFIG}
      onViewableItemsChanged={observeViewability}
      ListHeaderComponent={<View style={styles.listHeader}>
        <Text style={styles.cardTitle}>沿途收藏</Text>
        <Text style={styles.cardCopy}>每次追加 12 条，最多追加 36 条。短列表自动补页；空列表由按钮发起首次加载。</Text>
        <ExposureObserver
          exposureKey="demo-ad-card"
          visiblePercentThreshold={50}
          minimumViewTime={300}
          active={screenFocused && observationActive}
          onExposure={observeExposure}
          onVisibilityChange={observeVisibility}
          style={styles.adCard}
        >
          <Text style={styles.cardTag}>推广 · 包装组件曝光</Text>
          <Text style={styles.cardTitle}>下一段风景，等你发现</Text>
          <Text style={styles.cardCopy}>广告和按钮滚出视口后再回顶部，停留 300 ms 可再次计数；暂停后恢复也会重新计时。</Text>
        </ExposureObserver>
        <View style={styles.toolbar}>
          <ObservedHeaderButton
            expanded={headerExpanded}
            active={screenFocused && observationActive}
            onPress={() => setHeaderExpanded(value => !value)}
            onExposure={observeExposure}
            onVisibilityChange={observeVisibility}
          />
          <Choice label={failureArmed ? "已设下次失败" : "模拟下次失败"} active={failureArmed} onPress={() => {
            failNextPage.current = !failNextPage.current;
            setFailureArmed(failNextPage.current);
          }} />
        </View>
        {headerExpanded && <Text style={styles.cardCopy}>头部横跨所有列，随内容一起滚动。展开后重新测量高度，可滚到中部再改变内容，观察滚动锚点。</Text>}
      </View>}
      ListEmptyComponent={<View style={styles.emptyState}>
        <Text style={styles.cardTitle}>这里还没有内容</Text>
        <Text style={styles.cardCopy}>空列表不会自动触发触底加载。</Text>
        <Choice label={loadingMore ? "加载中…" : "加载第一批"} onPress={() => loadMore(true)} />
      </View>}
      ListFooterComponent={<View style={styles.listFooter}>
        <Text style={styles.refreshText}>{refreshing ? "正在刷新列表…" : loadingMore ? "正在加载下一页…" : pageError ? "本次加载失败，点击重试" : !hasMore ? "已经看完全部内容" : "向下滚动，加载更多"}</Text>
        {pageError && <Choice label="重试" onPress={() => loadMore(true)} />}
        <Choice label={footerExpanded ? "收起尾部" : "展开尾部"} onPress={() => setFooterExpanded(value => !value)} />
        {footerExpanded && <Text style={styles.cardCopy}>这是可变高度尾部。滚到底部应显示此说明与底部内边距；加载状态和高度变化不会单独重试失败的分页请求。</Text>}
      </View>}
      estimatedItemSize={270}
      refreshing={refreshing}
      onRefresh={onRefresh}
      renderRefreshHeader={info => <RefreshHeader {...info} />}
      refreshHeaderHeight={64}
      refreshThreshold={64}
      onDiagnostics={setDiagnostics}
    /> : <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>在原生开发构建中打开</Text>
      <Text style={styles.unavailableText}>此原型包含自定义原生模块，需要包含 react-native-nitro-list 与 react-native-nitro-viewability 的 Android 或 iOS development build。Expo Go 无法加载，Web 暂未实现。</Text>
    </View>}
    <Text style={styles.footer}>原型 · 尚未完成原生编译与设备验收 · 图片来自 picsum.photos</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F3F4F0" },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, color: "#687E75" },
  heading: { fontSize: 29, fontWeight: "800", color: "#183E32", marginTop: 8 },
  subtitle: { fontSize: 12, color: "#68776E", marginTop: 6 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 18 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  choice: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#E6EAE3" },
  choiceActive: { backgroundColor: "#234D3E" },
  choiceText: { fontSize: 11, fontWeight: "600", color: "#40544A" },
  choiceTextActive: { color: "#FFFFFF" },
  pressed: { opacity: 0.65 },
  diagnostics: { marginTop: 12, gap: 3 },
  observations: { gap: 3 },
  diagnosticsText: { fontSize: 10, color: "#5C6B63", fontVariant: ["tabular-nums"] },
  list: { flex: 1 },
  listHeader: { paddingBottom: 16 },
  adCard: { marginTop: 12, padding: 16, borderRadius: 14, backgroundColor: "#E5EDDB" },
  listFooter: { paddingTop: 18, gap: 10, alignItems: "center" },
  emptyState: { paddingVertical: 24, gap: 14, alignItems: "center" },
  card: { borderRadius: 14, overflow: "hidden", backgroundColor: "#FFFFFF" },
  noteCard: { backgroundColor: "#E5EDDB" },
  imageFrame: { width: "100%", backgroundColor: "#DEE4DC", justifyContent: "center", alignItems: "center" },
  imageError: { color: "#5C6B63", fontSize: 12 },
  cardBody: { padding: 12 },
  cardTag: { fontSize: 9, color: "#788277" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#203F31", marginTop: 7, lineHeight: 21 },
  cardCopy: { fontSize: 12, lineHeight: 20, color: "#5A6D60", marginTop: 9 },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 13 },
  actionText: { fontSize: 11, fontWeight: "500", color: "#496E55" },
  favorite: { fontSize: 22, color: "#829287" },
  favoriteSelected: { color: "#C86C52" },
  refreshHeader: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  refreshIcon: { fontSize: 24, color: "#234D3E" },
  refreshText: { fontSize: 12, color: "#5A6D60" },
  unavailable: { flex: 1, margin: 16, padding: 24, borderRadius: 18, backgroundColor: "#E5EDDB", justifyContent: "center" },
  unavailableTitle: { fontSize: 20, fontWeight: "700", color: "#234D3E" },
  unavailableText: { marginTop: 12, fontSize: 14, lineHeight: 25, color: "#5A6D60" },
  footer: { textAlign: "center", color: "#859086", fontSize: 9, paddingVertical: 9, paddingHorizontal: 12 },
});
