import {
  createElement, forwardRef, isValidElement, useCallback, useEffect, useId, useImperativeHandle,
  useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { ForwardedRef, RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, NativeSyntheticEvent } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import Animated, { useEvent, useSharedValue } from 'react-native-reanimated';
import NativeList from './specs/NitroListViewNativeComponent';
import type { NativeListScrollEvent, NativeViewableItemsEvent } from './specs/NitroListViewNativeComponent';
import NativeSlot from './specs/NitroListSlotViewNativeComponent';
import type { ListConfig, ListItem, ListSnapshot, NitroListController, SlotBinding } from './specs/NitroListController.nitro';
import type { NitroListAccessory, NitroListContentStyle, NitroListDiagnostics, NitroListProps, NitroListRef, NitroListScrollInfo, NitroListScrollState, NitroListViewToken, RefreshState } from './types';
import { RecyclingKeyContext } from './useRecyclingState';

const AnimatedNativeList = Animated.createAnimatedComponent(NativeList);
const refreshStates = new Set<RefreshState>(['idle', 'pulling', 'ready', 'refreshing', 'settling']);
const scrollStates = new Set<string>(['idle', 'dragging', 'settling']);
const labels: Record<RefreshState, string> = {
  idle: '下拉刷新', pulling: '下拉刷新', ready: '释放刷新', refreshing: '正在刷新', settling: '刷新完成',
};
let nextDataVersion = 0;

type Entry<T> = { descriptor: ListItem } & (
  | { kind: 'item'; item: T; index: number; itemKey: string }
  | { kind: 'accessory'; component: NitroListAccessory }
);
interface RenderSlot<T> extends SlotBinding { entry: Entry<T> }
interface Dataset<T> {
  entries: Map<string, Entry<T>>;
  descriptors: ListItem[];
  extraData: unknown;
  dataCount: number;
  tailKey: string;
}

const paddingKeys = new Set(['padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']);
function resolvePadding(style: NitroListProps<unknown>['contentContainerStyle']) {
  const flat: NitroListContentStyle = StyleSheet.flatten(style) ?? {};
  for (const [key, value] of Object.entries(flat)) {
    if (!paddingKeys.has(key)) throw new Error(`NitroList contentContainerStyle does not support ${key}.`);
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new Error(`NitroList contentContainerStyle.${key} must be a nonnegative finite number.`);
    }
  }
  return {
    paddingTop: flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0,
    paddingRight: flat.paddingRight ?? flat.paddingHorizontal ?? flat.padding ?? 0,
    paddingBottom: flat.paddingBottom ?? flat.paddingVertical ?? flat.padding ?? 0,
    paddingLeft: flat.paddingLeft ?? flat.paddingHorizontal ?? flat.padding ?? 0,
  };
}

function accessory(component: NitroListAccessory) {
  return component == null || isValidElement(component) ? component : createElement(component);
}

function positive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`NitroList ${name} must be a positive finite number.`);
}

function scrollInfo(event: NativeListScrollEvent): NitroListScrollInfo {
  return {
    contentOffset: { x: 0, y: event.offsetY },
    contentSize: { width: event.viewportWidth, height: event.contentHeight },
    layoutMeasurement: { width: event.viewportWidth, height: event.viewportHeight },
    state: event.state as NitroListScrollState,
    timestamp: event.timestamp,
  };
}

function Slot<T>({ slot, listId, width, renderItem, controller, onMount }: {
  slot: RenderSlot<T>;
  listId: string;
  width: number;
  renderItem: NitroListProps<T>['renderItem'];
  controller: RefObject<NitroListController | null>;
  onMount: () => void;
}) {
  const contentRef = useRef<View>(null);
  const { slotId, token, version } = slot;
  const report = useCallback((measuredWidth: number, height: number) => {
    if (measuredWidth > 0 && height >= 0) {
      controller.current?.reportMeasurement(slotId, token, version, measuredWidth, height);
    }
  }, [controller, slotId, token, version]);

  useEffect(onMount, [onMount]);
  // onLayout doesn't fire when a recycled item has the same dimensions. Measure
  // after every bind as well, and cancel an old binding's asynchronous callback.
  useLayoutEffect(() => {
    let current = true;
    contentRef.current?.measure((_x, _y, measuredWidth, height) => {
      if (current) report(measuredWidth, height);
    });
    return () => { current = false; };
  }, [report, width, slot.entry]);

  return (
    <NativeSlot
      listId={listId}
      slotId={slotId}
      bindingToken={token}
      itemVersion={version}
      collapsable={false}
      style={[styles.slot, { width }]}
    >
      <RecyclingKeyContext.Provider value={slot.entry.kind === 'item' ? slot.entry.itemKey : slot.key}>
        <View
          ref={contentRef}
          collapsable={false}
          style={{ width }}
          onLayout={(event) => report(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        >
          {slot.entry.kind === 'item'
            ? renderItem({ item: slot.entry.item, index: slot.entry.index, itemKey: slot.entry.itemKey })
            : accessory(slot.entry.component)}
        </View>
      </RecyclingKeyContext.Provider>
    </NativeSlot>
  );
}

function NitroListAndroid<T>({
  data, renderItem, keyExtractor, getItemType, extraData,
  layout = 'list', numColumns = 2, gap = 0, estimatedItemSize = 160,
  style, refreshing = false, onRefresh, renderRefreshHeader,
  refreshHeaderHeight = 64, refreshThreshold = 64, onDiagnostics,
  contentContainerStyle, ListHeaderComponent, ListFooterComponent, ListEmptyComponent,
  onEndReached, onEndReachedThreshold = 0.5, loadingMore = false, hasMore = true,
  onScroll, onScrollStateChange, onScrollBeginDrag, onScrollEndDrag,
  onMomentumScrollBegin, onMomentumScrollEnd, scrollEventThrottle = 16,
  viewabilityConfig, onViewableItemsChanged,
}: NitroListProps<T>, ref: ForwardedRef<NitroListRef>) {
  positive('estimatedItemSize', estimatedItemSize);
  positive('refreshHeaderHeight', refreshHeaderHeight);
  positive('refreshThreshold', refreshThreshold);
  if (!Number.isInteger(numColumns) || numColumns < 1) throw new Error('NitroList numColumns must be a positive integer.');
  if (!Number.isFinite(gap) || gap < 0) throw new Error('NitroList gap must be a nonnegative finite number.');
  if (!Number.isFinite(onEndReachedThreshold) || onEndReachedThreshold < 0) throw new Error('NitroList onEndReachedThreshold must be a nonnegative finite number.');
  if (!Number.isFinite(scrollEventThrottle) || scrollEventThrottle < 0) throw new Error('NitroList scrollEventThrottle must be a nonnegative finite number.');
  const { itemVisiblePercentThreshold = 50, minimumViewTime = 0, waitForInteraction = false } = viewabilityConfig ?? {};
  if (!Number.isFinite(itemVisiblePercentThreshold) || itemVisiblePercentThreshold < 0 || itemVisiblePercentThreshold > 100) {
    throw new Error('NitroList itemVisiblePercentThreshold must be between 0 and 100.');
  }
  if (!Number.isFinite(minimumViewTime) || minimumViewTime < 0) throw new Error('NitroList minimumViewTime must be a nonnegative finite number.');
  const scrollEventsEnabled = !!(onScroll || onScrollStateChange || onScrollBeginDrag || onScrollEndDrag || onMomentumScrollBegin || onMomentumScrollEnd);
  const viewabilityEnabled = !!onViewableItemsChanged;
  const viewabilityEpoch = useMemo(() => ++nextDataVersion,
    [data, keyExtractor, getItemType, extraData, viewabilityEnabled, itemVisiblePercentThreshold, minimumViewTime, waitForInteraction]);
  const { paddingTop, paddingRight, paddingBottom, paddingLeft } = resolvePadding(contentContainerStyle);
  const endReachedEnabled = !!onEndReached && !loadingMore && hasMore && !refreshing;
  // Separate event freshness from native de-duplication: an empty page/new array
  // must invalidate queued events without authorizing another automatic request.
  const endReachedEpoch = useMemo(() => ++nextDataVersion, [data, refreshing]);
  const columns = layout === 'masonry' ? numColumns : 1;
  const listId = useId();
  const controller = useRef<NitroListController | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [width, setWidth] = useState(0);
  const [slots, setSlots] = useState<RenderSlot<T>[]>([]);
  const [refreshState, setRefreshState] = useState<RefreshState>(refreshing ? 'refreshing' : 'idle');
  const pullDistance = useSharedValue(0);
  const progress = useSharedValue(0);
  const stats = useRef({ createdCells: 0, rebinds: 0, reactMounts: 0 });
  const mounted = useRef(false);
  const callbacks = useRef({ onRefresh, onDiagnostics, onEndReached, endReachedEnabled, endReachedEpoch });
  const observationCallbacks = useRef({
    onScroll, onScrollStateChange, onScrollBeginDrag, onScrollEndDrag,
    onMomentumScrollBegin, onMomentumScrollEnd, onViewableItemsChanged, viewabilityEpoch,
  });
  const viewableItems = useRef(new Map<string, NitroListViewToken<T>>());
  const receivedViewability = useRef(false);
  const lastDiagnostics = useRef<NitroListDiagnostics | null>(null);
  const renderedSlots = useRef(slots);
  const diagnosticsScheduled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedData = useRef<Dataset<T> | null>(null);

  const config = useMemo<ListConfig>(() => ({
    layout, numColumns: columns, gap, estimatedItemSize,
    refreshEnabled: !!onRefresh, refreshHeaderHeight, refreshThreshold,
    paddingTop, paddingRight, paddingBottom, paddingLeft,
    endReachedEnabled, endReachedThreshold: onEndReachedThreshold, endReachedEpoch,
    scrollEventsEnabled, scrollEventThrottle, viewabilityEnabled,
    itemVisiblePercentThreshold, minimumViewTime, waitForInteraction, viewabilityEpoch,
  }), [layout, columns, gap, estimatedItemSize, !!onRefresh, refreshHeaderHeight, refreshThreshold,
    paddingTop, paddingRight, paddingBottom, paddingLeft, endReachedEnabled, onEndReachedThreshold, endReachedEpoch,
    scrollEventsEnabled, scrollEventThrottle, viewabilityEnabled, itemVisiblePercentThreshold, minimumViewTime, waitForInteraction, viewabilityEpoch]);

  const dataset = useMemo(() => {
    const previous = committedData.current;
    const sameExtraData = previous !== null && Object.is(previous.extraData, extraData);
    const entries = new Map<string, Entry<T>>();
    const descriptors = data.map((item, index): ListItem => {
      const itemKey = keyExtractor(item, index);
      const key = `item:${itemKey}`;
      if (typeof itemKey !== 'string' || entries.has(key)) {
        throw new Error(`NitroList keyExtractor must return unique strings; invalid or duplicate key: ${String(itemKey)}`);
      }
      const rawType = getItemType?.(item, index) ?? 'default';
      // Keep numeric and string type namespaces distinct (1 is not "1").
      const type = `item:${typeof rawType}:${rawType}`;
      const old = previous?.entries.get(key);
      // renderItem receives index: a move can change content/height even when
      // the item object is unchanged. Reject measurements from its old position.
      const descriptor = old?.kind === 'item' && sameExtraData && Object.is(old.item, item) && old.index === index && old.descriptor.type === type
        ? old.descriptor
        : { key, type, version: ++nextDataVersion, fullSpan: false };
      entries.set(key, { kind: 'item', item, itemKey, index, descriptor });
      return descriptor;
    });
    const tailKey = descriptors.at(-1)?.key ?? '';
    const addAccessory = (name: string, component: NitroListAccessory | undefined, atStart = false) => {
      if (component == null) return;
      const key = `accessory:${name}`;
      const old = previous?.entries.get(key);
      const descriptor = old?.kind === 'accessory' && sameExtraData && Object.is(old.component, component)
        ? old.descriptor
        : { key, type: key, version: ++nextDataVersion, fullSpan: true };
      entries.set(key, { kind: 'accessory', component, descriptor });
      if (atStart) descriptors.unshift(descriptor); else descriptors.push(descriptor);
    };
    addAccessory('header', ListHeaderComponent, true);
    if (data.length === 0) addAccessory('empty', ListEmptyComponent);
    addAccessory('footer', ListFooterComponent);
    if (previous && sameExtraData && descriptors.length === previous.descriptors.length &&
        descriptors.every((descriptor, index) => descriptor === previous.descriptors[index])) {
      return previous;
    }
    return { entries, descriptors, extraData, dataCount: data.length, tailKey };
  }, [data, keyExtractor, getItemType, extraData, ListHeaderComponent, ListFooterComponent, ListEmptyComponent]);

  const scheduleDiagnostics = useCallback(() => {
    if (diagnosticsScheduled.current !== null || !mounted.current) return;
    // Avoid forcing the application to render on every native bind.
    diagnosticsScheduled.current = setTimeout(() => {
      diagnosticsScheduled.current = null;
      if (!mounted.current) return;
      const currentSlots = renderedSlots.current;
      const value: NitroListDiagnostics = {
        ...stats.current,
        mountedSlots: currentSlots.length,
        activeSlots: currentSlots.filter((slot) => slot.active).length,
      };
      const last = lastDiagnostics.current;
      if (!last || (Object.keys(value) as (keyof NitroListDiagnostics)[]).some(key => value[key] !== last[key])) {
        lastDiagnostics.current = value;
        callbacks.current.onDiagnostics?.(value);
      }
    }, 100);
  }, []);

  const onMount = useCallback(() => {
    stats.current.reactMounts += 1;
    scheduleDiagnostics();
  }, [scheduleDiagnostics]);

  const acceptSnapshot = useCallback((snapshot: ListSnapshot) => {
    if (!mounted.current) return;
    stats.current.createdCells = snapshot.createdCells;
    stats.current.rebinds = snapshot.rebinds;
    setSlots((previous) => {
      const existing = new Map(previous.map((slot) => [slot.slotId, slot]));
      return snapshot.slots.flatMap((binding): RenderSlot<T>[] => {
        const entry = committedData.current?.entries.get(binding.key);
        const oldSlot = existing.get(binding.slotId);
        if (oldSlot && binding.token < oldSlot.token) return [oldSlot];
        if (entry?.descriptor.version === binding.version && entry.descriptor.type === binding.type) {
          return [{ ...binding, entry }];
        }
        // Retained inactive pool entries may refer to an item removed from data.
        // Keep their subtree until the slot is rebound or evicted by native code.
        if (oldSlot && oldSlot.token === binding.token && oldSlot.key === binding.key) {
          return [{ ...oldSlot, active: binding.active }];
        }
        // A snapshot can be in flight while a newer dataset commits. Retain the
        // instance until its up-to-date binding arrives. A changed identity stays
        // hidden; same-item content updates may keep their last committed frame.
        if (oldSlot && oldSlot.type === binding.type) return [{ ...oldSlot, active: false }];
        return [];
      });
    });
  }, []);

  useLayoutEffect(() => {
    committedData.current = dataset;
    callbacks.current = { onRefresh, onDiagnostics, onEndReached, endReachedEnabled, endReachedEpoch };
    observationCallbacks.current = {
      onScroll, onScrollStateChange, onScrollBeginDrag, onScrollEndDrag,
      onMomentumScrollBegin, onMomentumScrollEnd, onViewableItemsChanged, viewabilityEpoch,
    };
    if (!viewabilityEnabled) {
      viewableItems.current.clear();
      receivedViewability.current = false;
    }
    renderedSlots.current = slots;
  });

  useLayoutEffect(() => {
    mounted.current = true;
    let live = true;
    try {
      const instance = NitroModules.createHybridObject<NitroListController>('NitroListController');
      controller.current = instance;
      instance.connect(listId, (snapshot) => { if (live) acceptSnapshot(snapshot); });
    } catch (cause) {
      setError(new Error('NitroList native initialization failed. Install an Android development build with react-native-nitro-list and Nitro 0.37.1.', { cause }));
    }
    return () => {
      live = false;
      mounted.current = false;
      viewableItems.current.clear();
      receivedViewability.current = false;
      if (diagnosticsScheduled.current !== null) clearTimeout(diagnosticsScheduled.current);
      diagnosticsScheduled.current = null;
      controller.current?.disconnect();
      controller.current = null;
    };
  }, [listId, acceptSnapshot]);

  // Queue the data before publishing its event epoch. Native calls are ordered
  // on the UI thread, so a new-epoch snapshot cannot describe the old dataset.
  useLayoutEffect(() => { controller.current?.setItems(dataset.descriptors); }, [dataset]);
  useLayoutEffect(() => { controller.current?.configure(config); }, [config]);
  useLayoutEffect(() => { controller.current?.setRefreshing(refreshing); }, [refreshing]);
  useEffect(scheduleDiagnostics, [slots, scheduleDiagnostics]);

  useImperativeHandle(ref, () => ({
    scrollToOffset({ offset, animated = true }) {
      if (!Number.isFinite(offset) || offset < 0) throw new Error('NitroList scroll offset must be nonnegative and finite.');
      controller.current?.scrollToOffset(offset, animated);
    },
    scrollToEnd({ animated = true } = {}) { controller.current?.scrollToEnd(animated); },
  }), []);

  const onPullProgress = useEvent<NativeSyntheticEvent<{ distance: number; progress: number }>>((event) => {
    'worklet';
    pullDistance.value = event.distance;
    progress.value = event.progress;
  }, ['onPullProgress']);

  const onRefreshStateChange = useCallback((event: NativeSyntheticEvent<{ state: string }>) => {
    const state = event.nativeEvent.state as RefreshState;
    if (refreshStates.has(state)) setRefreshState(state);
  }, []);
  const onRefreshRequested = useCallback(() => { callbacks.current.onRefresh?.(); }, []);
  const onNativeEndReached = useCallback((event: NativeSyntheticEvent<{ dataCount: number; tailKey: string; epoch: number }>) => {
    const current = committedData.current;
    if (!mounted.current || !callbacks.current.endReachedEnabled || !current?.dataCount) return;
    if (event.nativeEvent.epoch !== callbacks.current.endReachedEpoch) return;
    // Ignore an event queued before a refresh/replacement/append committed in JS.
    if (event.nativeEvent.dataCount !== current.dataCount || event.nativeEvent.tailKey !== current.tailKey) return;
    callbacks.current.onEndReached?.();
  }, []);
  const onNativeScroll = useCallback((event: NativeSyntheticEvent<NativeListScrollEvent>) => {
    if (!mounted.current || !scrollStates.has(event.nativeEvent.state)) return;
    observationCallbacks.current.onScroll?.(scrollInfo(event.nativeEvent));
  }, []);
  const onNativeScrollStateChange = useCallback((event: NativeSyntheticEvent<NativeListScrollEvent>) => {
    if (!mounted.current || !scrollStates.has(event.nativeEvent.state)) return;
    const info = scrollInfo(event.nativeEvent);
    const handlers = observationCallbacks.current;
    const previous = event.nativeEvent.previousState;
    // End the old phase before announcing the next phase.
    if (previous === 'dragging' && info.state !== previous) handlers.onScrollEndDrag?.(info);
    if (previous === 'settling' && info.state !== previous) handlers.onMomentumScrollEnd?.(info);
    if (info.state === 'dragging' && info.state !== previous) handlers.onScrollBeginDrag?.(info);
    if (info.state === 'settling' && info.state !== previous) handlers.onMomentumScrollBegin?.(info);
    handlers.onScrollStateChange?.(info);
  }, []);
  const onNativeViewableItemsChange = useCallback((event: NativeSyntheticEvent<NativeViewableItemsEvent>) => {
    const handlers = observationCallbacks.current;
    if (!mounted.current || !handlers.onViewableItemsChanged || event.nativeEvent.epoch !== handlers.viewabilityEpoch) return;
    const next = new Map<string, NitroListViewToken<T>>();
    for (const candidate of event.nativeEvent.items) {
      const entry = committedData.current?.entries.get(candidate.key);
      // A snapshot is authoritative only when every candidate belongs to this
      // committed dataset; filtering a stale subset would invent exit events.
      if (entry?.kind !== 'item' || entry.descriptor.version !== candidate.version) return;
      next.set(entry.itemKey, { item: entry.item, key: entry.itemKey, index: entry.index, isViewable: true });
    }
    const changed: NitroListViewToken<T>[] = [];
    for (const [key, previous] of viewableItems.current) {
      if (!next.has(key)) changed.push({ ...previous, isViewable: false });
    }
    for (const [key, token] of next) {
      const previous = viewableItems.current.get(key);
      if (!previous || previous.index !== token.index || !Object.is(previous.item, token.item)) changed.push(token);
    }
    const initial = !receivedViewability.current;
    receivedViewability.current = true;
    viewableItems.current = next;
    if (initial || changed.length > 0) {
      handlers.onViewableItemsChanged({
        viewableItems: [...next.values()].sort((a, b) => a.index - b.index),
        changed,
      });
    }
  }, []);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  if (error) throw error;
  const contentWidth = Math.max(1, width - paddingLeft - paddingRight);
  const columnWidth = Math.max(1, (contentWidth - (columns - 1) * gap) / columns);
  const headerInfo = { state: refreshState, pullDistance, progress };
  return (
    <AnimatedNativeList
      listId={listId}
      style={[styles.list, style]}
      onLayout={onLayout}
      onPullProgress={onPullProgress}
      onRefreshStateChange={onRefreshStateChange}
      onRefreshRequested={onRefreshRequested}
      onEndReached={onNativeEndReached}
      onListScroll={onNativeScroll}
      onListScrollStateChange={onNativeScrollStateChange}
      onViewableItemsChange={onNativeViewableItemsChange}
    >
      <View collapsable={false} style={[styles.header, { width, height: refreshHeaderHeight }]}>
        {renderRefreshHeader ? renderRefreshHeader(headerInfo) : (
          <View style={styles.defaultHeader}>
            {refreshState === 'refreshing' ? <ActivityIndicator /> : null}
            <Text>{labels[refreshState]}</Text>
          </View>
        )}
      </View>
      {width > 0 ? slots.map((slot) => (
        <Slot key={slot.slotId} slot={slot} listId={listId} width={slot.entry.descriptor.fullSpan ? contentWidth : columnWidth}
          renderItem={renderItem} controller={controller} onMount={onMount} />
      )) : null}
    </AnimatedNativeList>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, overflow: 'hidden' },
  slot: { position: 'absolute', left: 0, top: 0 },
  header: { position: 'absolute', left: 0, top: 0 },
  defaultHeader: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
});

export default forwardRef(NitroListAndroid);
