import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  NativeList, NativeSectionList, useListContext, useRecyclingState,
  type NativeListRef, type NativeSectionListRef, type RefreshHeaderInfo, type RefreshState,
} from 'react-native-nitro-list';
import Animated, { interpolate, interpolateColor, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Scenario = 'headers' | 'sticky' | 'context' | 'position' | 'sections';
type Preset = 'long' | 'short' | 'empty' | 'emptyGroups' | 'allEmptyGroups' | 'dynamic';
type Row = { id: string; title: string; number: number; kind: 'filter' | 'heading' | 'item' };
type ListContext = ReturnType<typeof useListContext>;
type LogHandle = { add: (message: string) => void; clear: () => void };
const PRESETS: [Preset, string][] = [['long', '长列表'], ['short', '短列表'], ['empty', '空列表'], ['emptyGroups', '部分空组'], ['allEmptyGroups', '全空组'], ['dynamic', '动态高度']];
const INSTRUCTIONS: Record<Scenario, string> = {
  headers: '切换配置后回顶部下拉。上方刷新带动头部，下方刷新保持头部；覆盖模式不推动内容。展开头部检查实时布局。',
  sticky: '上下滚动，观察组标题推走或替换。双层时筛选栏和日期独立吸顶；点击标题后继续滚动，检查计数和展开状态。',
  context: '滚动 0–160dp，头部由透明变白、标题和阴影渐显。回顶继续下拉，offsetY 应保持 0；普通 onScroll 同时计数。',
  position: '切换对齐、偏移和避让后定位；惯性滚动中停止。试验无效 key、定位后立即删除目标，并查看失败日志。',
  sections: '跳转到第 3 组或组内条目，标题应避开固定头部。部分空组检查混合布局；全空组保留标题和组尾，并显示业务空状态。',
};
function makeRows(preset: Preset, headings: boolean): Row[] {
  if (preset === 'empty') return [];
  const count = preset === 'short' ? 2 : preset === 'allEmptyGroups' ? 0 : 120;
  if (!headings) return Array.from({ length: count }, (_, n) => ({ id: `item-${n}`, title: `本地条目 ${n}`, number: n, kind: 'item' }));
  const rows: Row[] = [{ id: 'filter', title: '筛选栏 · 独立层级', number: 0, kind: 'filter' }];
  const groupCount = preset === 'short' ? 1 : 8;
  const itemsPerGroup = count / groupCount;
  for (let g = 0; g < groupCount; g++) {
    rows.push({ id: `group-${g}`, title: `日期分组 ${g + 1}`, number: g, kind: 'heading' });
    if (preset === 'emptyGroups' && g % 2 === 0) continue;
    for (let n = 0; n < itemsPerGroup; n++) {
      const number = g * itemsPerGroup + n;
      rows.push({ id: `item-${number}`, title: `本地条目 ${number}`, number, kind: 'item' });
    }
  }
  return rows;
}
const keyExtractor = (item: Row) => item.id;

function Button({ title, active, onPress }: { title: string; active?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }} onPress={onPress}
    style={({ pressed }) => [styles.button, active && styles.selected, pressed && { opacity: 0.6 }]}>
    <Text style={[styles.buttonText, active && { color: '#fff' }]}>{title}</Text>
  </Pressable>;
}
function EventLog({ ref }: { ref: Ref<LogHandle> }) {
  const [entries, setEntries] = useState<string[]>([]);
  const seq = useRef(0);
  useImperativeHandle(ref, () => ({
    add: message => setEntries(items => [`${++seq.current}. ${message}`, ...items].slice(0, 20)),
    clear: () => { seq.current = 0; setEntries([]); },
  }), []);
  return <View style={styles.log}><Text style={styles.caption}>事件日志（保留 20 条）</Text>
    <ScrollView style={{ maxHeight: 62 }} nestedScrollEnabled>
      {entries.length ? entries.map(entry => <Text key={entry} style={styles.mono}>{entry}</Text>) : <Text style={styles.mono}>暂无事件</Text>}
    </ScrollView>
  </View>;
}
function Metrics({ context, calls }: { context: ListContext; calls: { current: number } }) {
  const [line, setLine] = useState('等待布局…');
  useEffect(() => {
    const timer = setInterval(() => {
      const r = (n: number) => Math.round(n);
      setLine(`y ${r(context.offsetY.value)} · 下拉 ${r(context.pullDistance.value)} · 头部底 ${r(context.headerBottom.value)} · 吸顶线 ${r(context.stickyTop.value)}\n` +
        `可视 ${r(context.viewportHeight.value)} / 内容 ${r(context.contentHeight.value)} / 最大 ${r(context.maxOffsetY.value)} · ${context.scrollState.value}\n` +
        `顶 ${context.isAtStart.value} / 底 ${context.isAtEnd.value} · 估算位置 ${context.isOffsetEstimated.value} / 高度 ${context.isContentSizeEstimated.value} · onScroll ${calls.current}`);
    }, 100);
    return () => clearInterval(timer);
  }, [context, calls]);
  return <View style={styles.metrics}><Text style={styles.caption}>useListContext · 100ms 采样</Text><Text style={styles.mono}>{line}</Text></View>;
}
function TestRow({ item, dynamic, resetVersion = 0 }: { item: Row; dynamic: boolean; resetVersion?: number }) {
  const [count, setCount] = useRecyclingState(0);
  const [expanded, setExpanded] = useRecyclingState(false);
  const lastReset = useRef(resetVersion);
  useEffect(() => {
    if (lastReset.current !== resetVersion) {
      lastReset.current = resetVersion;
      setCount(0); setExpanded(false);
    }
  }, [resetVersion, setCount, setExpanded]);
  const heading = item.kind !== 'item';
  return <Pressable accessibilityRole="button" onPress={() => { setCount(n => n + 1); setExpanded(v => !v); }}
    style={[styles.row, heading && styles.group, item.kind === 'filter' && styles.filter,
      !heading && { minHeight: dynamic ? 64 + (item.number % 5) * 23 : 72 }]}>
    <Text style={styles.rowTitle}>{item.title}</Text>
    <Text style={styles.caption}>{item.id} · 点击 {count} 次</Text>
    {expanded && <Text style={styles.copy}>展开内容：本地状态应在吸顶和解除吸顶之间连续，条目回收换绑时重置。再次点击收起。</Text>}
  </Pressable>;
}
function RefreshHeader({ state, progress }: RefreshHeaderInfo) {
  const animation = useAnimatedStyle(() => ({ opacity: 0.3 + Math.min(1, progress.value) * 0.7 }));
  return <Animated.View style={[styles.refresh, animation]}><Text>↓ 刷新区域 · {state}</Text></Animated.View>;
}
function FixedHeader({ context, transparent, expanded, onPress }: { context: ListContext; transparent: boolean; expanded: boolean; onPress: () => void }) {
  const background = useAnimatedStyle(() => ({
    backgroundColor: transparent ? interpolateColor(context.offsetY.value, [0, 160], ['rgba(255,255,255,0)', 'rgba(255,255,255,1)']) : '#f8d990',
    elevation: transparent ? interpolate(Math.min(160, context.offsetY.value), [0, 160], [0, 6]) : 0,
    borderBottomWidth: transparent ? Math.min(1, context.offsetY.value / 160) : 1,
  }));
  const title = useAnimatedStyle(() => ({ opacity: transparent ? Math.min(1, context.offsetY.value / 160) : 1 }));
  return <Animated.View style={[styles.fixed, background]}>
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Animated.Text style={[styles.rowTitle, title]}>固定头部 · 点击{expanded ? '收起' : '展开'}</Animated.Text>
      <Text style={styles.caption}>高度 {expanded ? '展开' : '默认'} / 与列表共享容器坐标</Text>
      {expanded && <Text style={[styles.copy, { paddingVertical: 18 }]}>动态增加头部高度，检查列表占位和吸顶位置是否同步。</Text>}
    </Pressable>
  </Animated.View>;
}

function ScenarioScreen({ scenario }: { scenario: Scenario }) {
  const context = useListContext();
  const list = useRef<NativeListRef>(null);
  const sectionList = useRef<NativeSectionListRef>(null);
  const log = useRef<LogHandle>(null);
  const calls = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preset, setPreset] = useState<Preset>('long');
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<'inset' | 'overlay'>(scenario === 'context' ? 'overlay' : 'inset');
  const [placement, setPlacement] = useState<'aboveHeader' | 'belowHeader'>('belowHeader');
  const [reveal, setReveal] = useState<'push' | 'overlay'>('push');
  const [refreshOffset, setRefreshOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [multi, setMulti] = useState(true);
  const [transition, setTransition] = useState<'push' | 'replace'>('push');
  const [custom, setCustom] = useState(false);
  const [follow, setFollow] = useState(true);
  const [masonry, setMasonry] = useState(false);
  const [align, setAlign] = useState<'start' | 'center' | 'end'>('start');
  const [offset, setOffset] = useState(0);
  const [avoid, setAvoid] = useState(true);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [stickyEnabled, setStickyEnabled] = useState(true);
  const [resetVersion, setResetVersion] = useState(0);
  const addLog = useCallback((message: string) => log.current?.add(message), []);
  const clearTimer = useCallback(() => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => clearTimer, [clearTimer]);
  const finishRefresh = useCallback(() => { clearTimer(); setRefreshing(false); addLog('refreshing=false'); }, [clearTimer, addLog]);
  const startRefresh = useCallback((autoFinish: boolean) => {
    clearTimer(); setRefreshing(true); addLog('refreshing=true');
    if (autoFinish) timer.current = setTimeout(finishRefresh, 1400);
  }, [clearTimer, finishRefresh, addLog]);
  const onRefresh = useCallback(() => startRefresh(true), [startRefresh]);
  const rows = useMemo(() => makeRows(preset, scenario === 'sticky').filter(row => !deleted.includes(row.id)), [preset, scenario, deleted]);
  const sections = useMemo(() => {
    if (preset === 'empty') return [];
    return Array.from({ length: preset === 'short' ? 1 : 8 }, (_, sectionIndex) => ({
      key: `section-${sectionIndex}`, title: `第 ${sectionIndex + 1} 组`,
      data: preset === 'allEmptyGroups' || (preset === 'emptyGroups' && sectionIndex % 2 === 0) ? [] : makeRows(preset === 'short' ? 'short' : 'long', false).slice(0, 12),
    }));
  }, [preset]);
  const renderRow = useCallback(({ item }: { item: Row }) => <TestRow item={item} dynamic={preset === 'dynamic'} resetVersion={resetVersion} />, [preset, resetVersion]);
  const command = (action: () => void | Promise<unknown>) => {
    try { const result = action(); if (result) void result.catch(error => addLog(String(error))); }
    catch (error) { addLog(String(error)); }
  };
  const reset = () => {
    clearTimer(); setRefreshing(false); setPreset('long'); setDeleted([]); setHasHeader(true);
    setMode(scenario === 'context' ? 'overlay' : 'inset'); setPlacement('belowHeader'); setReveal('push');
    setRefreshOffset(0); setExpanded(false); setMulti(true); setTransition('push'); setCustom(false);
    setFollow(true); setMasonry(false); setAlign('start'); setOffset(0); setAvoid(true); setStickyEnabled(true);
    setResetVersion(v => v + 1);
    calls.current = 0; log.current?.clear(); command(() => context.scrollToTop({ animated: false }));
  };
  const options = { align, offset, avoidHeaders: avoid, animated: true };
  const common = {
    style: styles.list, scrollBinding: context.scrollBinding, keyExtractor,
    layout: masonry ? 'masonry' as const : 'list' as const, numColumns: masonry ? 2 : 1, gap: 6,
    estimatedItemSize: 84,
    FixedHeaderComponent: hasHeader ? <FixedHeader context={context} transparent={scenario === 'context'} expanded={expanded} onPress={() => setExpanded(v => !v)} /> : null,
    fixedHeaderMode: mode, refreshPlacement: placement, refreshRevealMode: reveal, refreshOffset,
    stickyHeaderAnchor: custom ? 'containerTop' as const : 'headerBottom' as const,
    stickyHeaderOffset: custom ? 100 : 0, stickyHeaderFollowRefresh: follow,
    refreshing, onRefresh, renderRefreshHeader: RefreshHeader,
    onRefreshStateChange: (state: RefreshState) => addLog(`刷新状态 ${state}`),
    ListEmptyComponent: <Text style={styles.empty}>没有业务条目 · 可下拉刷新或切换数据</Text>,
    ListFooterComponent: <Text style={styles.footer}>列表结束 · 最后一个吸顶标题应在边界退出</Text>,
    onStickyHeaderChange: (info: unknown) => addLog(`吸顶 ${JSON.stringify(info)}`),
    onScrollToItemFailed: (info: unknown) => addLog(`定位失败 ${JSON.stringify(info)}`),
    onScroll: () => { calls.current++; }, scrollEventThrottle: 120,
  };
  return <View style={styles.body}>
    <ScrollView style={styles.controls} contentContainerStyle={{ gap: 8, padding: 10 }} nestedScrollEnabled>
      <Text style={styles.copy}>{INSTRUCTIONS[scenario]}</Text>
      <View style={styles.buttons}>{PRESETS.map(([value, title]) => <Button key={value} title={title} active={preset === value} onPress={() => { setPreset(value); setDeleted([]); }} />)}</View>
      <View style={styles.buttons}>
        <Button title={hasHeader ? '头部：有' : '头部：无'} active={hasHeader} onPress={() => setHasHeader(v => !v)} />
        <Button title={`头部：${mode === 'inset' ? '占位' : '覆盖'}`} onPress={() => setMode(v => v === 'inset' ? 'overlay' : 'inset')} />
        <Button title={expanded ? '收起头部' : '展开头部'} onPress={() => setExpanded(v => !v)} />
        <Button title={`刷新：${placement === 'aboveHeader' ? '上方' : '下方'}`} onPress={() => setPlacement(v => v === 'aboveHeader' ? 'belowHeader' : 'aboveHeader')} />
        <Button title={`刷新：${reveal === 'push' ? '推动' : '覆盖'}`} onPress={() => setReveal(v => v === 'push' ? 'overlay' : 'push')} />
        <Button title={`刷新偏移 ${refreshOffset}`} onPress={() => setRefreshOffset(v => v ? 0 : 24)} />
      </View>
      {(scenario === 'sticky' || scenario === 'sections') && <View style={styles.buttons}>
        {scenario === 'sticky' && <Button title={multi ? '双层吸顶' : '单层吸顶'} onPress={() => setMulti(v => !v)} />}
        <Button title={`切换：${transition === 'push' ? '推走' : '替换'}`} onPress={() => setTransition(v => v === 'push' ? 'replace' : 'push')} />
        {scenario === 'sections' && <Button title={`分组吸顶：${stickyEnabled ? '开' : '关'}`} onPress={() => setStickyEnabled(v => !v)} />}
        <Button title={custom ? '吸顶：容器 +100' : '吸顶：头部下方'} onPress={() => setCustom(v => !v)} />
        <Button title={`跟随刷新：${follow ? '开' : '关'}`} onPress={() => setFollow(v => !v)} />
        <Button title={masonry ? '瀑布流' : '普通列表'} onPress={() => setMasonry(v => !v)} />
      </View>}
      {(scenario === 'position' || scenario === 'sections') && <View style={styles.buttons}>
        <Button title={`对齐 ${align}`} onPress={() => setAlign(v => v === 'start' ? 'center' : v === 'center' ? 'end' : 'start')} />
        <Button title={`偏移 ${offset}`} onPress={() => setOffset(v => v ? 0 : 24)} />
        <Button title={`避让：${avoid ? '开' : '关'}`} onPress={() => setAvoid(v => !v)} />
        {scenario === 'position' ? <>
          <Button title="index 80" onPress={() => command(() => context.scrollToIndex({ index: 80, ...options }))} />
          <Button title="key item-90" onPress={() => command(() => context.scrollToKey({ key: 'item-90', ...options }))} />
          <Button title="无效 key" onPress={() => command(() => context.scrollToKey({ key: 'missing', ...options }))} />
          <Button title="定位并删除目标" onPress={() => { command(() => context.scrollToKey({ key: 'item-100', ...options })); setDeleted(v => [...v, 'item-100']); }} />
          <Button title="删除首项" onPress={() => setDeleted(v => rows[0] ? [...v, rows[0].id] : v)} />
        </> : <>
          <Button title="第 3 组" onPress={() => command(() => sectionList.current?.scrollToSection({ sectionIndex: 2, ...options }))} />
          <Button title="第 3 组第 4 项" onPress={() => command(() => sectionList.current?.scrollToLocation({ sectionIndex: 2, itemIndex: 3, ...options }))} />
          <Button title="无效组" onPress={() => command(() => sectionList.current?.scrollToSection({ sectionIndex: 999, ...options }))} />
        </>}
        <Button title="下移 200" onPress={() => command(() => context.scrollBy({ deltaY: 200, animated: true }))} />
        <Button title="停止滚动" onPress={() => command(() => context.stopScroll())} />
        <Button title="指标快照" onPress={() => command(async () => addLog(`快照 ${JSON.stringify(await context.getScrollMetrics())}`))} />
      </View>}
      <View style={styles.buttons}>
        <Button title="回顶部" onPress={() => command(() => context.scrollToTop({ animated: true }))} />
        <Button title="到底部" onPress={() => command(() => context.scrollToEnd({ animated: true }))} />
        <Button title="模拟刷新" onPress={() => startRefresh(true)} />
        <Button title="手动开始" onPress={() => startRefresh(false)} />
        <Button title="手动结束" onPress={finishRefresh} />
        <Button title="重置当前场景" onPress={reset} />
      </View>
      <Text style={styles.caption}>当前：{preset} / {mode} / {placement} / {reveal} / refreshing={String(refreshing)}</Text>
    </ScrollView>
    <Metrics context={context} calls={calls} />
    <View style={styles.listFrame}>
      {scenario === 'sections' ? <NativeSectionList {...common} ref={sectionList} sections={sections} renderItem={renderRow}
        stickySectionHeadersEnabled={stickyEnabled} sectionStickyTransition={transition}
        renderSectionHeader={({ section, sectionIndex }) => <TestRow item={{ id: section.key, title: section.title ?? section.key, number: sectionIndex, kind: 'heading' }} dynamic={false} resetVersion={resetVersion} />}
        renderSectionFooter={({ section }) => <Text style={styles.footer}>{section.key} · 组尾</Text>} /> :
        <NativeList {...common} ref={list} data={rows} renderItem={renderRow}
          getItemType={item => item.kind}
          getStickyConfig={scenario === 'sticky' ? item => item.kind === 'filter'
            ? multi ? { group: 'filter', level: 0, transition } : undefined
            : item.kind === 'heading' ? { group: 'date', level: multi ? 1 : 0, transition,
              endAtKey: rows.some(row => row.id === `group-${item.number + 1}`) ? `group-${item.number + 1}` : undefined } : undefined : undefined} />}
    </View>
    <EventLog ref={log} />
  </View>;
}

export default function ListTestPage({ scenario, title }: { scenario: Scenario; title: string }) {
  const insets = useSafeAreaInsets();
  const available = Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.heading}>
      <Button title="← 测试目录" onPress={() => router.canGoBack() ? router.back() : router.replace('/nitro-list-tests')} />
      <Text style={styles.title}>{title}</Text>
    </View>
    {available ? <ScenarioScreen scenario={scenario} /> : <View style={styles.unavailable}>
      <Text style={styles.title}>需要 Android 开发构建</Text><Text style={styles.copy}>此页面使用自定义原生模块。Expo Go、iOS 和 Web 不挂载原生列表；请在包含 NativeList 的 Android 开发构建中打开。</Text>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f4f3' }, body: { flex: 1, minHeight: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 6 },
  title: { fontSize: 18, fontWeight: '700', color: '#163e36' },
  controls: { flexGrow: 0, maxHeight: 215, backgroundColor: '#fff' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  button: { backgroundColor: '#e8eeea', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8 },
  selected: { backgroundColor: '#246657' }, buttonText: { color: '#244a40', fontSize: 12, fontWeight: '600' },
  copy: { color: '#48564f', fontSize: 12, lineHeight: 18 }, caption: { color: '#526459', fontSize: 10, lineHeight: 16 },
  metrics: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#e6f0ed' },
  mono: { fontSize: 10, color: '#334d43', lineHeight: 14, fontVariant: ['tabular-nums'] },
  listFrame: { flex: 1, minHeight: 110, borderWidth: 1, borderColor: '#a9bbb3', marginHorizontal: 8, overflow: 'hidden' },
  list: { flex: 1 }, row: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderColor: '#dce6df' },
  rowTitle: { color: '#203f35', fontSize: 14, fontWeight: '700' }, group: { backgroundColor: '#c9e5df' },
  filter: { backgroundColor: '#cbd6f2' }, fixed: { padding: 12, minHeight: 62, borderColor: '#bac8bf' },
  refresh: { height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d5eaf8' },
  empty: { padding: 24, textAlign: 'center', color: '#66776d' }, footer: { padding: 12, color: '#65796b', backgroundColor: '#e5ebe7', fontSize: 11 },
  log: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f7f9f7' },
  unavailable: { flex: 1, justifyContent: 'center', padding: 28, gap: 16 },
});
