import type { ReactNode } from 'react';
import type { NativeListProps, NativeListRef, ScrollToItemOptions } from './types';

export interface NativeListSection<T> {
  key: string;
  title?: string;
  data: readonly T[];
}

export interface NativeSectionInfo<T, S extends NativeListSection<T> = NativeListSection<T>> {
  section: S;
  sectionIndex: number;
}

export interface NativeSectionRenderItemInfo<T, S extends NativeListSection<T> = NativeListSection<T>>
  extends NativeSectionInfo<T, S> {
  item: T;
  /** Index within the section. */
  index: number;
  itemKey: string;
}

export interface NativeSectionViewToken<T, S extends NativeListSection<T> = NativeListSection<T>>
  extends NativeSectionRenderItemInfo<T, S> {
  key: string;
  isViewable: boolean;
}

export interface NativeSectionScrollFailure {
  reason: string;
  sectionIndex?: number;
  itemIndex?: number;
  sectionKey?: string;
}

export interface NativeSectionStickyChange {
  level: number;
  sectionKey: string | null;
  previousSectionKey: string | null;
  sectionIndex: number | null;
}

export interface NativeSectionListProps<T, S extends NativeListSection<T> = NativeListSection<T>>
  extends Omit<NativeListProps<T>,
    'data' | 'renderItem' | 'keyExtractor' | 'getItemType' | 'getItemLayout' |
    'getStickyConfig' | 'onViewableItemsChanged' | 'onStickyHeaderChange' | 'onScrollToItemFailed'> {
  sections: readonly S[];
  renderItem: (info: NativeSectionRenderItemInfo<T, S>) => ReactNode;
  keyExtractor: (item: T, index: number, section: S) => string;
  getItemType?: (item: T, index: number, section: S) => string | number;
  renderSectionHeader?: (info: NativeSectionInfo<T, S>) => ReactNode;
  renderSectionFooter?: (info: NativeSectionInfo<T, S>) => ReactNode;
  stickySectionHeadersEnabled?: boolean;
  sectionStickyLevel?: number;
  sectionStickyTransition?: 'push' | 'replace';
  onViewableItemsChanged?: (info: {
    viewableItems: NativeSectionViewToken<T, S>[];
    changed: NativeSectionViewToken<T, S>[];
  }) => void;
  onStickyHeaderChange?: (info: NativeSectionStickyChange) => void;
  onScrollToItemFailed?: (info: NativeSectionScrollFailure) => void;
}

export interface NativeSectionListRef extends Omit<NativeListRef, 'scrollToIndex' | 'scrollToKey'> {
  scrollToSection(options: ScrollToItemOptions & { sectionIndex: number }): void;
  scrollToLocation(options: ScrollToItemOptions & { sectionIndex: number; itemIndex: number }): void;
}
