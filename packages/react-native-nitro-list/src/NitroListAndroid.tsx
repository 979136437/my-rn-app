import {
  forwardRef, useCallback, useEffect, useId, useImperativeHandle,
  useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { ForwardedRef, RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, NativeSyntheticEvent } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import Animated, { useEvent, useSharedValue } from 'react-native-reanimated';
import NativeList from './specs/NitroListViewNativeComponent';
import NativeSlot from './specs/NitroListSlotViewNativeComponent';
import type { ListConfig, ListItem, ListSnapshot, NitroListController, SlotBinding } from './specs/NitroListController.nitro';
import type { NitroListDiagnostics, NitroListProps, NitroListRef, RefreshState } from './types';
import { RecyclingKeyContext } from './useRecyclingState';

const AnimatedNativeList = Animated.createAnimatedComponent(NativeList);
const refreshStates = new Set<RefreshState>(['idle', 'pulling', 'ready', 'refreshing', 'settling']);
const labels: Record<RefreshState, string> = {
  idle: '下拉刷新', pulling: '下拉刷新', ready: '释放刷新', refreshing: '正在刷新', settling: '刷新完成',
};
let nextDataVersion = 0;

interface RenderSlot<T> extends SlotBinding { item: T }
interface Entry<T> { item: T; index: number; descriptor: ListItem }
interface Dataset<T> { entries: Map<string, Entry<T>>; descriptors: ListItem[]; extraData: unknown }

function positive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`NitroList ${name} must be a positive finite number.`);
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
  }, [report, width, slot.item, slot.index]);

  return (
    <NativeSlot
      listId={listId}
      slotId={slotId}
      bindingToken={token}
      itemVersion={version}
      collapsable={false}
      style={[styles.slot, { width }]}
    >
      <RecyclingKeyContext.Provider value={slot.key}>
        <View
          ref={contentRef}
          collapsable={false}
          style={{ width }}
          onLayout={(event) => report(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
        >
          {renderItem({ item: slot.item, index: slot.index, itemKey: slot.key })}
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
}: NitroListProps<T>, ref: ForwardedRef<NitroListRef>) {
  positive('estimatedItemSize', estimatedItemSize);
  positive('refreshHeaderHeight', refreshHeaderHeight);
  positive('refreshThreshold', refreshThreshold);
  if (!Number.isInteger(numColumns) || numColumns < 1) throw new Error('NitroList numColumns must be a positive integer.');
  if (!Number.isFinite(gap) || gap < 0) throw new Error('NitroList gap must be a nonnegative finite number.');
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
  const callbacks = useRef({ onRefresh, onDiagnostics });
  const renderedSlots = useRef(slots);
  const diagnosticsScheduled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedData = useRef<Dataset<T> | null>(null);

  const config = useMemo<ListConfig>(() => ({
    layout, numColumns: columns, gap, estimatedItemSize,
    refreshEnabled: !!onRefresh, refreshHeaderHeight, refreshThreshold,
  }), [layout, columns, gap, estimatedItemSize, !!onRefresh, refreshHeaderHeight, refreshThreshold]);

  const dataset = useMemo(() => {
    const previous = committedData.current;
    const sameExtraData = previous !== null && Object.is(previous.extraData, extraData);
    const entries = new Map<string, Entry<T>>();
    const descriptors = data.map((item, index): ListItem => {
      const key = keyExtractor(item, index);
      if (typeof key !== 'string' || entries.has(key)) {
        throw new Error(`NitroList keyExtractor must return unique strings; invalid or duplicate key: ${String(key)}`);
      }
      const rawType = getItemType?.(item, index) ?? 'default';
      // Keep numeric and string type namespaces distinct (1 is not "1").
      const type = `${typeof rawType}:${rawType}`;
      const old = previous?.entries.get(key);
      // renderItem receives index: a move can change content/height even when
      // the item object is unchanged. Reject measurements from its old position.
      const descriptor = old && sameExtraData && Object.is(old.item, item) && old.index === index && old.descriptor.type === type
        ? old.descriptor
        : { key, type, version: ++nextDataVersion };
      entries.set(key, { item, index, descriptor });
      return descriptor;
    });
    if (previous && sameExtraData && descriptors.length === previous.descriptors.length &&
        descriptors.every((descriptor, index) => descriptor === previous.descriptors[index])) {
      return previous;
    }
    return { entries, descriptors, extraData };
  }, [data, keyExtractor, getItemType, extraData]);

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
      callbacks.current.onDiagnostics?.(value);
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
          return [{ ...binding, item: entry.item }];
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
    callbacks.current = { onRefresh, onDiagnostics };
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
      if (diagnosticsScheduled.current !== null) clearTimeout(diagnosticsScheduled.current);
      diagnosticsScheduled.current = null;
      controller.current?.disconnect();
      controller.current = null;
    };
  }, [listId, acceptSnapshot]);

  useLayoutEffect(() => { controller.current?.configure(config); }, [config]);
  useLayoutEffect(() => { controller.current?.setItems(dataset.descriptors); }, [dataset]);
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
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  if (error) throw error;
  const columnWidth = Math.max(1, (width - (columns - 1) * gap) / columns);
  const headerInfo = { state: refreshState, pullDistance, progress };
  return (
    <AnimatedNativeList
      listId={listId}
      style={[styles.list, style]}
      onLayout={onLayout}
      onPullProgress={onPullProgress}
      onRefreshStateChange={onRefreshStateChange}
      onRefreshRequested={onRefreshRequested}
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
        <Slot key={slot.slotId} slot={slot} listId={listId} width={columnWidth}
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
