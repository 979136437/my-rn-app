import type { ReactNode } from 'react';
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
