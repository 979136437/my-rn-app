import type { HybridObject } from 'react-native-nitro-modules';

export interface ListItem {
  key: string;
  type: string;
  version: number;
  fullSpan: boolean;
  role: string;
  stickyGroup: string;
  stickyLevel: number;
  stickyTransition: string;
  stickyEndKey: string;
}

export type ListLayout = 'list' | 'masonry';

export interface ListConfig {
  layout: ListLayout;
  numColumns: number;
  gap: number;
  estimatedItemSize: number;
  refreshEnabled: boolean;
  refreshHeaderHeight: number;
  refreshThreshold: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  endReachedEnabled: boolean;
  endReachedThreshold: number;
  endReachedEpoch: number;
  scrollEventsEnabled: boolean;
  scrollEventThrottle: number;
  viewabilityEnabled: boolean;
  itemVisiblePercentThreshold: number;
  minimumViewTime: number;
  waitForInteraction: boolean;
  viewabilityEpoch: number;
  fixedHeaderHeight: number;
  fixedHeaderMode: string;
  refreshPlacement: string;
  refreshRevealMode: string;
  refreshOffset: number;
  stickyHeaderAnchor: string;
  stickyHeaderOffset: number;
  stickyHeaderFollowRefresh: boolean;
  metricsEnabled: boolean;
}

export interface ScrollMetrics {
  offsetY: number;
  pullDistance: number;
  viewportHeight: number;
  contentHeight: number;
  maxOffsetY: number;
  scrollState: string;
  isAtStart: boolean;
  isAtEnd: boolean;
  headerBottom: number;
  stickyTop: number;
  isOffsetEstimated: boolean;
  isContentSizeEstimated: boolean;
  timestamp: number;
}

export interface SlotBinding {
  slotId: string;
  key: string;
  index: number;
  type: string;
  token: number;
  version: number;
  active: boolean;
}

export interface ListSnapshot {
  slots: SlotBinding[];
  createdCells: number;
  rebinds: number;
}

export interface NitroListController extends HybridObject<{ android: 'kotlin'; ios: 'swift' }> {
  connect(listId: string, onSnapshot: (snapshot: ListSnapshot) => void): void;
  configure(config: ListConfig): void;
  setItems(items: ListItem[]): void;
  setRefreshing(refreshing: boolean): void;
  resolveEndReached(requestId: number, accepted: boolean): void;
  reportMeasurement(slotId: string, token: number, version: number, width: number, height: number): void;
  scrollToOffset(offset: number, animated: boolean): void;
  scrollToEnd(animated: boolean): void;
  /** Move relative to the current scroll position, in dp. */
  scrollBy(deltaY: number, animated: boolean): void;
  /** Seek a stable internal item key and correct after its layout is measured. */
  scrollToItem(key: string, animated: boolean, align: string, offset: number, avoidHeaders: boolean): void;
  /** Stop native scrolling and cancel pending item alignment. */
  stopScroll(): void;
  /** Capture metrics on the native UI thread. */
  getScrollMetrics(): Promise<ScrollMetrics>;
  disconnect(): void;
}
