import { Children, isValidElement, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { findNodeHandle, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import { NitroModules } from 'react-native-nitro-modules';
import { PickerViewColumn } from './PickerViewColumn';
import type { PickerConfig, PickerController, PickerEvent } from './specs/PickerController.nitro';
import type { PickerViewColumnProps, PickerViewProps } from './types';

let nextEpoch = 0;
const normalize = (index: number | undefined, count: number) => count === 0 ? -1
  : Math.min(count - 1, Math.max(0, Number.isFinite(index) ? Math.trunc(index!) : 0));

export default function PickerViewAndroid({
  children, value, defaultValue, onChange, itemHeight = 44, immediateChange = false,
  indicatorStyle, maskStyle, onPickStart, onPickEnd, style,
}: PickerViewProps) {
  if (!Number.isFinite(itemHeight) || itemHeight <= 0) throw new Error('PickerView itemHeight must be positive and finite.');
  const columns = Children.toArray(children).map(child => {
    if (!isValidElement<PickerViewColumnProps>(child) || child.type !== PickerViewColumn) {
      throw new Error('PickerView accepts only direct PickerViewColumn children.');
    }
    return child;
  });
  const counts = columns.map(column => Children.toArray(column.props.children).length);
  // Content may rerender without invalidating a gesture. Changed row keys/order or
  // column membership invalidate every old event, including queued Nitro callbacks.
  const topology = JSON.stringify(columns.map(column => [column.key,
    Children.toArray(column.props.children).map((row, index) => isValidElement(row) ? row.key : index)]));
  const sourceEpoch = useMemo(() => ++nextEpoch, [topology, itemHeight]);
  const [internal, setInternal] = useState<readonly number[]>(() => defaultValue ?? []);
  const [reconciliation, setReconciliation] = useState(0);
  const selected = counts.map((count, index) => normalize((value ?? internal)[index], count));
  const selectedKey = JSON.stringify(selected);
  const current = useRef(selected);
  const mounted = useRef(true);
  const committed = useRef({ onChange, onPickStart, onPickEnd, controlled: value !== undefined, counts });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    committed.current = { onChange, onPickStart, onPickEnd, controlled: value !== undefined, counts };
  });
  useLayoutEffect(() => {
    current.current = JSON.parse(selectedKey) as number[];
    // Persist normalization so a removed option does not reappear selected later.
    if (value === undefined) setInternal(previous => JSON.stringify(previous) === selectedKey ? previous : current.current);
  }, [selectedKey, sourceEpoch, value === undefined, reconciliation]);

  const receive = useCallback((columnIndex: number, event: PickerEvent) => {
    if (!mounted.current) return;
    const latest = committed.current;
    if (event.phase === 'start') latest.onPickStart?.({ columnIndex });
    else if (event.phase === 'end') {
      latest.onPickEnd?.({ columnIndex });
      setReconciliation(previous => previous + 1);
    }
    else if (event.phase === 'change') {
      const index = normalize(event.index, latest.counts[columnIndex] ?? 0);
      if (current.current[columnIndex] === index) return;
      const next = [...current.current];
      next[columnIndex] = index;
      current.current = next;
      if (!latest.controlled) setInternal(next);
      latest.onChange?.({ value: [...next], columnIndex });
    }
  }, []);

  const indicatorAppearance = StyleSheet.flatten(indicatorStyle) ?? {};
  const { backgroundColor, experimental_backgroundImage, ...indicatorOutline } = indicatorAppearance;
  const indicatorLayout: ViewStyle = {
    position: 'absolute', left: 0, right: 0, top: '50%', height: itemHeight,
    transform: [{ translateY: -itemHeight / 2 }],
    pointerEvents: 'none',
  };
  return <View style={[styles.picker, style, { minHeight: itemHeight }]}>
    {/* Background belongs below React content, even when its color is opaque. */}
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants"
      style={[indicatorAppearance, indicatorLayout]} />
    {columns.map((column, columnIndex) => <Column key={column.key}
      descriptor={column} columnIndex={columnIndex} selectedIndex={selected[columnIndex]}
      sourceEpoch={sourceEpoch} itemHeight={itemHeight} immediateChange={immediateChange}
      maskStyle={maskStyle} receive={receive} />)}
    {/* Draw one shared selection band so borders and corners do not repeat at
        column boundaries. Keep it above the fades and outside scroll content. */}
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants"
      style={[styles.indicator, indicatorOutline, indicatorLayout]} />
  </View>;
}

type ColumnProps = Pick<PickerViewProps, 'maskStyle'> & {
  descriptor: ReactElement<PickerViewColumnProps>;
  columnIndex: number;
  selectedIndex: number;
  sourceEpoch: number;
  itemHeight: number;
  immediateChange: boolean;
  receive: (columnIndex: number, event: PickerEvent) => void;
};

function Column({ descriptor, columnIndex, selectedIndex, sourceEpoch, itemHeight,
  immediateChange, maskStyle, receive }: ColumnProps) {
  const rows = Children.toArray(descriptor.props.children);
  const scroll = useRef<ScrollView>(null);
  const controller = useRef<PickerController | null>(null);
  const session = useRef<(PickerConfig & { sourceEpoch: number; height: number }) | null>(null);
  const reported = useRef(selectedIndex);
  const callbacks = useRef({ receive, columnIndex });
  const alive = useRef(false);
  const cycle = useRef(false);
  const [height, setHeight] = useState(0);
  const [settlement, setSettlement] = useState(0);
  const [error, setError] = useState('');
  const padding = Math.max(0, (height - itemHeight) / 2);

  const handleEvent = useCallback((event: PickerEvent) => {
    if (!alive.current || event.epoch !== session.current?.epoch) return;
    if (event.error) { setError(event.error); return; }
    if (event.phase === 'start') cycle.current = true;
    if (event.phase === 'end') {
      if (!cycle.current) return;
      cycle.current = false;
    }
    if (event.phase === 'change') reported.current = event.index;
    callbacks.current.receive(callbacks.current.columnIndex, event);
    // A controlled consumer can reject a change by retaining its previous value.
    // Reconcile after the gesture even when that prop has not changed at all.
    if (event.phase === 'end') setSettlement(previous => previous + 1);
  }, []);

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (cycle.current) {
        cycle.current = false;
        callbacks.current.receive(callbacks.current.columnIndex, {
          epoch: session.current?.epoch ?? 0, index: reported.current, phase: 'end', error: '',
        });
      }
      session.current = null;
      controller.current?.disconnect();
      controller.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (!scroll.current || height === 0) return;
    const previous = session.current;
    const structural = !previous || previous.sourceEpoch !== sourceEpoch || previous.height !== height;
    const external = previous?.selectedIndex !== selectedIndex && reported.current !== selectedIndex;
    if ((structural || external) && cycle.current) {
      cycle.current = false;
      callbacks.current.receive(callbacks.current.columnIndex, {
        epoch: previous?.epoch ?? 0, index: reported.current, phase: 'end', error: '',
      });
    }
    callbacks.current = { receive, columnIndex };
    const config = {
      epoch: structural || external ? ++nextEpoch : previous.epoch,
      count: rows.length, selectedIndex, itemHeight, immediateChange, sourceEpoch, height,
    };
    session.current = config;
    if (structural || external) reported.current = selectedIndex;
    if (!controller.current) {
      const tag = findNodeHandle(scroll.current);
      if (tag == null) throw new Error('PickerView could not resolve its native scroll view.');
      controller.current = NitroModules.createHybridObject<PickerController>('PickerController');
      controller.current.connect(tag, config, handleEvent);
    } else controller.current.configure(config);
  }, [sourceEpoch, selectedIndex, height, itemHeight, immediateChange, rows.length, receive, columnIndex, handleEvent, settlement]);

  const onLayout = useCallback((event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height), []);
  if (error) throw new Error(`PickerView: ${error}`);
  const flattenedMask = StyleSheet.flatten(maskStyle) ?? {};
  const { backgroundColor = '#ffffff', ...maskAppearance } = flattenedMask;
  const fade = (direction: string) => ({
    experimental_backgroundImage: [{ type: 'linear-gradient' as const, direction,
      colorStops: [{ color: backgroundColor, positions: ['0%'] }, { color: 'transparent', positions: ['100%'] }] }],
  });
  return <View style={[styles.column, descriptor.props.style, { overflow: 'hidden' }]}
    accessible accessibilityRole="adjustable" accessibilityLabel={descriptor.props.accessibilityLabel ?? `第 ${columnIndex + 1} 列`}
    accessibilityValue={rows.length ? { min: 0, max: rows.length - 1, now: selectedIndex,
      text: `${selectedIndex + 1} / ${rows.length}` } : { text: '无选项' }}
    accessibilityActions={rows.length ? [{ name: 'increment', label: '下一项' }, { name: 'decrement', label: '上一项' }] : []}
    onAccessibilityAction={event => {
      const name = event.nativeEvent.actionName;
      if (name === 'increment' || name === 'decrement') controller.current?.step(name === 'increment' ? 1 : -1);
    }}>
    {/* Measure the viewport inside column padding, and anchor both fades to it. */}
    <View onLayout={onLayout} style={[styles.viewport, { minHeight: itemHeight }]}>
    {/* Disable hit testing on ScrollView's own content container, not just the
        option subtree. Android ReactViewGroup consumes DOWN even without a
        JS handler; that would bypass the ScrollView's Nitro touch listener. */}
    <ScrollView ref={scroll} style={styles.scroll}
      contentContainerStyle={{ paddingVertical: padding, pointerEvents: 'none' }}
      scrollEnabled={Platform.OS === 'ios'} disableScrollViewPanResponder
      showsVerticalScrollIndicator={false} overScrollMode="never"
      removeClippedSubviews={false} accessible={false} importantForAccessibility="no-hide-descendants">
      <View pointerEvents="none" collapsable={false}>
        {rows.map((row, index) => <View key={isValidElement(row) ? row.key : index}
          style={{ height: itemHeight, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>{row}</View>)}
      </View>
    </ScrollView>
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants"
      style={[maskAppearance, fade('to bottom'), styles.mask, { top: 0, height: padding }]} />
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants"
      style={[maskAppearance, fade('to top'), styles.mask, { bottom: 0, height: padding }]} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  picker: { height: 220, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#fff' },
  column: { flex: 1, minWidth: 0 },
  viewport: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  indicator: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5cf' },
  mask: { position: 'absolute', left: 0, right: 0, backgroundColor: 'transparent' },
});
