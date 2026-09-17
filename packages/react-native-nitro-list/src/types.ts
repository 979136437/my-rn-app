import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { ListScrollBinding } from './useListContext';

export type RefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'settling';

export interface RefreshHeaderInfo {
  state: RefreshState;
  /** Pull distance in density-independent pixels, updated on the UI thread. */
  pullDistance: SharedValue<number>;
  /** Pull distance divided by the trigger threshold, clamped to [0, 1]. */
  progress: SharedValue<number>;
}

export interface NativeListDiagnostics {
  createdCells: number;
  rebinds: number;
  mountedSlots: number;
  activeSlots: number;
  /** Cumulative React slot mounts (development Strict Mode can increase this). */
  reactMounts: number;
}

export interface NativeListRenderItemInfo<T> {
  item: T;
  index: number;
  itemKey: string;
}

export type NativeListAccessory = ReactElement | ComponentType<Record<string, never>> | null;

/** Numeric, nonnegative dp values only; individual edges override axis values. */
export interface NativeListContentStyle {
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

export type NativeListScrollState = 'idle' | 'dragging' | 'settling';

/** Distances are dp; dynamic, unmeasured content makes offset/size approximate. */
export interface NativeListScrollInfo {
  contentOffset: { x: number; y: number };
  contentSize: { width: number; height: number };
  layoutMeasurement: { width: number; height: number };
  state: NativeListScrollState;
  /** Monotonic native timestamp in milliseconds, not Unix time. */
  timestamp: number;
}

export interface NativeListViewabilityConfig {
  /** Visible percentage of the item's height; 0 still requires overlap. Default 50. */
  itemVisiblePercentThreshold?: number;
  /** Continuous time above the threshold in milliseconds. Default 0. */
  minimumViewTime?: number;
  /** Wait for a user drag before reporting viewable items. Default false. */
  waitForInteraction?: boolean;
}

export interface NativeListViewToken<T> {
  item: T;
  key: string;
  index: number;
  isViewable: boolean;
}

export interface NativeListViewabilityInfo<T> {
  viewableItems: NativeListViewToken<T>[];
  changed: NativeListViewToken<T>[];
}

export interface NativeListProps<T> {
  data: readonly T[];
  renderItem: (info: NativeListRenderItemInfo<T>) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  getItemType?: (item: T, index: number) => string | number;
  getItemLayout?: (item: T, index: number) => { fullSpan?: boolean; role?: 'item' | 'sectionHeader' | 'sectionFooter' };
  getStickyConfig?: (item: T, index: number) => StickyItemConfig | undefined;
  FixedHeaderComponent?: NativeListAccessory;
  fixedHeaderMode?: 'inset' | 'overlay';
  refreshPlacement?: 'aboveHeader' | 'belowHeader';
  refreshRevealMode?: 'push' | 'overlay';
  refreshOffset?: number;
  stickyHeaderAnchor?: 'headerBottom' | 'containerTop';
  stickyHeaderOffset?: number;
  stickyHeaderFollowRefresh?: boolean;
  scrollBinding?: ListScrollBinding;
  onStickyHeaderChange?: (info: StickyHeaderChangeInfo) => void;
  onScrollToItemFailed?: (info: ScrollToItemFailure) => void;
  onRefreshStateChange?: (state: RefreshState) => void;
  /** Change this when a row depends on state outside data. Use immutable data. */
  extraData?: unknown;
  layout?: 'list' | 'masonry';
  numColumns?: number;
  gap?: number;
  estimatedItemSize?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<NativeListContentStyle>;
  ListHeaderComponent?: NativeListAccessory;
  ListFooterComponent?: NativeListAccessory;
  ListEmptyComponent?: NativeListAccessory;
  onEndReached?: () => void;
  /** Distance from the end in usable viewport heights. Defaults to 0.5. */
  onEndReachedThreshold?: number;
  loadingMore?: boolean;
  hasMore?: boolean;
  onScroll?: (info: NativeListScrollInfo) => void;
  onScrollStateChange?: (info: NativeListScrollInfo) => void;
  onScrollBeginDrag?: (info: NativeListScrollInfo) => void;
  onScrollEndDrag?: (info: NativeListScrollInfo) => void;
  /** Settling includes programmatic animated scrolling. */
  onMomentumScrollBegin?: (info: NativeListScrollInfo) => void;
  onMomentumScrollEnd?: (info: NativeListScrollInfo) => void;
  /** Minimum interval in milliseconds; 0 means at most once per frame. Default 16. */
  scrollEventThrottle?: number;
  viewabilityConfig?: NativeListViewabilityConfig;
  onViewableItemsChanged?: (info: NativeListViewabilityInfo<T>) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  renderRefreshHeader?: (info: RefreshHeaderInfo) => ReactNode;
  refreshHeaderHeight?: number;
  refreshThreshold?: number;
  onDiagnostics?: (diagnostics: NativeListDiagnostics) => void;
}

export interface NativeListRef {
  scrollToOffset(options: { offset: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
  scrollToTop(options?: { animated?: boolean }): void;
  scrollBy(options: { deltaY: number; animated?: boolean }): void;
  scrollToIndex(options: ScrollToItemOptions & { index: number }): void;
  scrollToKey(options: ScrollToItemOptions & { key: string }): void;
  stopScroll(): void;
  getScrollMetrics(): Promise<NativeListScrollMetrics>;
}

export interface StickyItemConfig {
  group: string;
  level?: number;
  transition?: 'push' | 'replace';
  /** Exclusive business key boundary. Must follow this item. */
  endAtKey?: string;
}

export interface StickyHeaderChangeInfo {
  group: string;
  level: number;
  previousKey: string | null;
  key: string | null;
}

export interface ScrollToItemOptions {
  animated?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Positive values place the item below its alignment point. */
  offset?: number;
  avoidHeaders?: boolean;
}

export interface ScrollToItemFailure {
  key?: string;
  index?: number;
  reason: 'invalid-target' | 'target-removed' | 'measurement-timeout';
}

export interface NativeListScrollMetrics {
  offsetY: number;
  pullDistance: number;
  viewportHeight: number;
  contentHeight: number;
  maxOffsetY: number;
  scrollState: NativeListScrollState;
  isAtStart: boolean;
  isAtEnd: boolean;
  headerBottom: number;
  stickyTop: number;
  isOffsetEstimated: boolean;
  isContentSizeEstimated: boolean;
  timestamp: number;
}
