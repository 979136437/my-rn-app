import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type RefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'settling';

export interface RefreshHeaderInfo {
  state: RefreshState;
  /** Pull distance in density-independent pixels, updated on the UI thread. */
  pullDistance: SharedValue<number>;
  /** Pull distance divided by the trigger threshold, clamped to [0, 1]. */
  progress: SharedValue<number>;
}

export interface NitroListDiagnostics {
  createdCells: number;
  rebinds: number;
  mountedSlots: number;
  activeSlots: number;
  /** Cumulative React slot mounts (development Strict Mode can increase this). */
  reactMounts: number;
}

export interface NitroListRenderItemInfo<T> {
  item: T;
  index: number;
  itemKey: string;
}

export type NitroListAccessory = ReactElement | ComponentType<Record<string, never>> | null;

/** Numeric, nonnegative dp values only; individual edges override axis values. */
export interface NitroListContentStyle {
  padding?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

export type NitroListScrollState = 'idle' | 'dragging' | 'settling';

/** Distances are dp; dynamic, unmeasured content makes offset/size approximate. */
export interface NitroListScrollInfo {
  contentOffset: { x: number; y: number };
  contentSize: { width: number; height: number };
  layoutMeasurement: { width: number; height: number };
  state: NitroListScrollState;
  /** Monotonic native timestamp in milliseconds, not Unix time. */
  timestamp: number;
}

export interface NitroListViewabilityConfig {
  /** Visible percentage of the item's height; 0 still requires overlap. Default 50. */
  itemVisiblePercentThreshold?: number;
  /** Continuous time above the threshold in milliseconds. Default 0. */
  minimumViewTime?: number;
  /** Wait for a user drag before reporting viewable items. Default false. */
  waitForInteraction?: boolean;
}

export interface NitroListViewToken<T> {
  item: T;
  key: string;
  index: number;
  isViewable: boolean;
}

export interface NitroListViewabilityInfo<T> {
  viewableItems: NitroListViewToken<T>[];
  changed: NitroListViewToken<T>[];
}

export interface NitroListProps<T> {
  data: readonly T[];
  renderItem: (info: NitroListRenderItemInfo<T>) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  getItemType?: (item: T, index: number) => string | number;
  /** Change this when a row depends on state outside data. Use immutable data. */
  extraData?: unknown;
  layout?: 'list' | 'masonry';
  numColumns?: number;
  gap?: number;
  estimatedItemSize?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<NitroListContentStyle>;
  ListHeaderComponent?: NitroListAccessory;
  ListFooterComponent?: NitroListAccessory;
  ListEmptyComponent?: NitroListAccessory;
  onEndReached?: () => void;
  /** Distance from the end in usable viewport heights. Defaults to 0.5. */
  onEndReachedThreshold?: number;
  loadingMore?: boolean;
  hasMore?: boolean;
  onScroll?: (info: NitroListScrollInfo) => void;
  onScrollStateChange?: (info: NitroListScrollInfo) => void;
  onScrollBeginDrag?: (info: NitroListScrollInfo) => void;
  onScrollEndDrag?: (info: NitroListScrollInfo) => void;
  /** Settling includes programmatic animated scrolling. */
  onMomentumScrollBegin?: (info: NitroListScrollInfo) => void;
  onMomentumScrollEnd?: (info: NitroListScrollInfo) => void;
  /** Minimum interval in milliseconds; 0 means at most once per frame. Default 16. */
  scrollEventThrottle?: number;
  viewabilityConfig?: NitroListViewabilityConfig;
  onViewableItemsChanged?: (info: NitroListViewabilityInfo<T>) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  renderRefreshHeader?: (info: RefreshHeaderInfo) => ReactNode;
  refreshHeaderHeight?: number;
  refreshThreshold?: number;
  onDiagnostics?: (diagnostics: NitroListDiagnostics) => void;
}

export interface NitroListRef {
  scrollToOffset(options: { offset: number; animated?: boolean }): void;
  scrollToEnd(options?: { animated?: boolean }): void;
}
