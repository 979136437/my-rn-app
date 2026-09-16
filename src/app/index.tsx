import Constants, { ExecutionEnvironment } from "expo-constants";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { NitroList, useRecyclingState, type NitroListDiagnostics, type NitroListRef, type RefreshHeaderInfo } from "react-native-nitro-list";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Item = { id: string; number: number; kind: "photo" | "note"; title: string };
const EMPTY_DIAGNOSTICS: NitroListDiagnostics = { createdCells: 0, rebinds: 0, mountedSlots: 0, activeSlots: 0, reactMounts: 0 };
const createItems = (count: number): Item[] => Array.from({ length: count }, (_, index) => ({
  id: `item-${index}`,
  number: index,
  kind: index % 3 === 0 ? "note" : "photo",
  title: ["山野之间", "今天也慢一点", "看见城市的另一面", "收集一点日常"][index % 4],
}));
const keyExtractor = (item: Item) => item.id;
const getItemType = (item: Item) => item.kind;

function Choice({ label, active = false, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && styles.pressed]}>
    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
  </Pressable>;
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

export default function Index() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<NitroListRef>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const [layout, setLayout] = useState<"list" | "masonry">("masonry");
  const [count, setCount] = useState(1000);
  const [data, setData] = useState(() => createItems(1000));
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [diagnostics, setDiagnostics] = useState(EMPTY_DIAGNOSTICS);
  const available = Platform.OS === "android" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

  useEffect(() => () => { if (refreshTimer.current !== null) clearTimeout(refreshTimer.current); }, []);

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
    setRefreshing(true);
    refreshTimer.current = setTimeout(() => {
      addItem();
      setRefreshing(false);
      refreshTimer.current = null;
    }, 1100);
  }, [addItem]);
  const renderItem = useCallback(({ item }: { item: Item }) => <Card item={item} favorite={favorites.has(item.id)} onFavorite={onFavorite} />, [favorites, onFavorite]);
  const switchCount = (next: number) => {
    if (next === count) return;
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    setRefreshing(false);
    setCount(next);
    setData(createItems(next));
    setFavorites(new Set());
    setDiagnostics(EMPTY_DIAGNOSTICS);
  };
  const switchLayout = (next: "list" | "masonry") => {
    if (next === layout) return;
    setLayout(next);
    setDiagnostics(EMPTY_DIAGNOSTICS);
  };

  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <Text style={styles.eyebrow}>NITRO LIST / ANDROID PROTOTYPE</Text>
      <Text style={styles.heading}>让内容流动起来。</Text>
      <Text style={styles.subtitle}>原生列表 · React 子树复用 · 自定义下拉刷新</Text>
      <View style={styles.controls}>
        <Choice label="瀑布流" active={layout === "masonry"} onPress={() => switchLayout("masonry")} />
        <Choice label="列表" active={layout === "list"} onPress={() => switchLayout("list")} />
        <Choice label="1,000 条" active={count === 1000} onPress={() => switchCount(1000)} />
        <Choice label="10,000 条" active={count === 10000} onPress={() => switchCount(10000)} />
      </View>
      <View style={styles.diagnostics}>
        <Text style={styles.diagnosticsText}>数据 {data.length} · cell 创建 {diagnostics.createdCells} · 换绑 {diagnostics.rebinds}</Text>
        <Text style={styles.diagnosticsText}>槽位 {diagnostics.mountedSlots} / 活跃 {diagnostics.activeSlots} · React 累计挂载 {diagnostics.reactMounts}</Text>
      </View>
      <View style={styles.toolbar}>
        <Choice label="顶部插入" onPress={addItem} />
        <Choice label="删除首项" onPress={() => setData(items => items.slice(1))} />
        <Choice label="回顶部" onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })} />
        <Choice label="到底部" onPress={() => listRef.current?.scrollToEnd({ animated: true })} />
      </View>
    </View>
    {available ? <NitroList
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
      estimatedItemSize={270}
      refreshing={refreshing}
      onRefresh={onRefresh}
      renderRefreshHeader={info => <RefreshHeader {...info} />}
      refreshHeaderHeight={64}
      refreshThreshold={64}
      onDiagnostics={setDiagnostics}
    /> : <View style={styles.unavailable}>
      <Text style={styles.unavailableTitle}>在 Android 开发构建中打开</Text>
      <Text style={styles.unavailableText}>此原型包含自定义原生模块，需要包含 react-native-nitro-list 的 Android development build，Expo Go 无法加载。iOS 与 Web 暂未实现。</Text>
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
  diagnosticsText: { fontSize: 10, color: "#5C6B63", fontVariant: ["tabular-nums"] },
  list: { flex: 1, marginHorizontal: 16 },
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
