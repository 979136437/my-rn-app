import type { HybridObject } from 'react-native-nitro-modules';

export interface ListItem {
  key: string;
  type: string;
  version: number;
  fullSpan: boolean;
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

export interface NitroListController extends HybridObject<{ android: 'kotlin' }> {
  connect(listId: string, onSnapshot: (snapshot: ListSnapshot) => void): void;
  configure(config: ListConfig): void;
  setItems(items: ListItem[]): void;
  setRefreshing(refreshing: boolean): void;
  reportMeasurement(slotId: string, token: number, version: number, width: number, height: number): void;
  scrollToOffset(offset: number, animated: boolean): void;
  scrollToEnd(animated: boolean): void;
  disconnect(): void;
}
