import { useMemo, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { NativeListRef, NativeListScrollMetrics } from './types';

export type ListMetricValues = {
  [K in keyof NativeListScrollMetrics]: SharedValue<NativeListScrollMetrics[K]>;
};

/** Opaque single-list binding. Pass it to NativeList's scrollBinding prop. */
export interface ListScrollBinding {
  readonly values: ListMetricValues;
  /** @internal */
  attach(owner: string, commands: NativeListRef): () => void;
}

/** UI-thread metrics and JS commands for one NativeList / NativeSectionList. */
export function useListContext(): ListMetricValues & NativeListRef & { scrollBinding: ListScrollBinding } {
  const offsetY = useSharedValue(0);
  const pullDistance = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const maxOffsetY = useSharedValue(0);
  const scrollState = useSharedValue<NativeListScrollMetrics['scrollState']>('idle');
  const isAtStart = useSharedValue(true);
  const isAtEnd = useSharedValue(true);
  const headerBottom = useSharedValue(0);
  const stickyTop = useSharedValue(0);
  const isOffsetEstimated = useSharedValue(true);
  const isContentSizeEstimated = useSharedValue(true);
  const timestamp = useSharedValue(0);
  const target = useRef<{ owner: string; commands: NativeListRef } | null>(null);
  return useMemo(() => {
    const values: ListMetricValues = { offsetY, pullDistance, viewportHeight, contentHeight, maxOffsetY,
      scrollState, isAtStart, isAtEnd, headerBottom, stickyTop, isOffsetEstimated, isContentSizeEstimated, timestamp };
    const current = () => {
      if (!target.current) throw new Error('useListContext is not connected to a mounted list.');
      return target.current.commands;
    };
    const commands: NativeListRef = {
      scrollToOffset: options => current().scrollToOffset(options),
      scrollToEnd: options => current().scrollToEnd(options),
      scrollToTop: options => current().scrollToTop(options),
      scrollBy: options => current().scrollBy(options),
      scrollToKey: options => current().scrollToKey(options),
      scrollToIndex: options => current().scrollToIndex(options),
      stopScroll: () => current().stopScroll(),
      getScrollMetrics: async () => current().getScrollMetrics(),
    };
    return { ...values, ...commands, scrollBinding: {
      values,
      attach(owner, next) {
        if (target.current) throw new Error('A useListContext instance can only bind to one list.');
        const connection = { owner, commands: next };
        target.current = connection;
        return () => { if (target.current === connection) target.current = null; };
      },
    } };
  }, [offsetY, pullDistance, viewportHeight, contentHeight, maxOffsetY, scrollState, isAtStart, isAtEnd,
    headerBottom, stickyTop, isOffsetEstimated, isContentSizeEstimated, timestamp]);
}
