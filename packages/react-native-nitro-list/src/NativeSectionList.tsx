import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import type { ForwardedRef, ReactElement, RefAttributes } from 'react';
import { NativeList } from './NativeList';
import type { NativeListProps, NativeListRef, NativeListViewToken } from './types';
import type { ListScrollBinding } from './useListContext';
import type {
  NativeListSection, NativeSectionListProps, NativeSectionListRef, NativeSectionViewToken,
} from './sectionTypes';

type Row<T, S extends NativeListSection<T>> = {
  key: string;
  section: S;
  sectionIndex: number;
} & ({ role: 'sectionHeader' | 'sectionFooter' } | { role: 'item'; item: T; index: number; itemKey: string });

const headerKey = (sectionKey: string) => JSON.stringify([sectionKey, 'header']);
const itemKey = (sectionKey: string, key: string) => JSON.stringify([sectionKey, 'item', key]);
function sectionKeyFromInternal(key: string | null): string | null {
  if (key === null) return null;
  try {
    const parts: unknown = JSON.parse(key);
    return Array.isArray(parts) && typeof parts[0] === 'string' ? parts[0] : null;
  } catch { return null; }
}

function NativeSectionListImpl<T, S extends NativeListSection<T>>(
  props: NativeSectionListProps<T, S>, ref: ForwardedRef<NativeSectionListRef>,
) {
  const {
    sections, renderItem, keyExtractor, getItemType, renderSectionHeader, renderSectionFooter,
    stickySectionHeadersEnabled = true, sectionStickyLevel = 0, sectionStickyTransition = 'push',
    onViewableItemsChanged, onStickyHeaderChange, onScrollToItemFailed, scrollBinding, ...listProps
  } = props;
  const listRef = useRef<NativeListRef>(null);
  const rows = useMemo(() => {
    const result: Row<T, S>[] = [];
    const sectionKeys = new Set<string>();
    sections.forEach((section, sectionIndex) => {
      if (typeof section.key !== 'string' || sectionKeys.has(section.key)) {
        throw new Error('NativeSectionList requires unique string section keys.');
      }
      sectionKeys.add(section.key);
      const base = { section, sectionIndex };
      if (renderSectionHeader) result.push({ ...base, role: 'sectionHeader', key: headerKey(section.key) });
      const keys = new Set<string>();
      section.data.forEach((item, index) => {
        const key = keyExtractor(item, index, section);
        if (typeof key !== 'string' || keys.has(key)) {
          throw new Error(`NativeSectionList requires unique string item keys in section ${section.key}.`);
        }
        keys.add(key);
        result.push({ ...base, role: 'item', item, index, itemKey: key, key: itemKey(section.key, key) });
      });
      if (renderSectionFooter) result.push({ ...base, role: 'sectionFooter', key: JSON.stringify([section.key, 'footer']) });
    });
    return result;
  }, [sections, keyExtractor, !!renderSectionHeader, !!renderSectionFooter]);
  const rowByKey = useMemo(() => new Map(rows.map(row => [row.key, row])), [rows]);
  const sectionBinding = useMemo<ListScrollBinding | undefined>(() => {
    if (!scrollBinding) return undefined;
    const requireSectionCoordinates = () => {
      throw new Error('Use NativeSectionList ref.scrollToSection() or ref.scrollToLocation() for section targets; useListContext does not expose internal flattened indices or keys.');
    };
    return {
      values: scrollBinding.values,
      attach: (owner, commands) => scrollBinding.attach(owner, {
        ...commands,
        scrollToIndex: requireSectionCoordinates,
        scrollToKey: requireSectionCoordinates,
      }),
    };
  }, [scrollBinding]);

  const connected = useCallback(() => {
    if (!listRef.current) throw new Error('NativeSectionList is not connected to a mounted list.');
    return listRef.current;
  }, []);
  useImperativeHandle(ref, () => ({
    scrollToOffset: options => connected().scrollToOffset(options),
    scrollToEnd: options => connected().scrollToEnd(options),
    scrollToTop: options => connected().scrollToTop(options),
    scrollBy: options => connected().scrollBy(options),
    stopScroll: () => connected().stopScroll(),
    getScrollMetrics: () => connected().getScrollMetrics(),
    scrollToSection: ({ sectionIndex, ...options }) => {
      const list = connected();
      const target = rows.find(row => row.sectionIndex === sectionIndex);
      if (!Number.isInteger(sectionIndex) || !target) {
        onScrollToItemFailed?.({ reason: 'invalid-target', sectionIndex });
        return;
      }
      list.scrollToKey({ ...options, key: target.key });
    },
    scrollToLocation: ({ sectionIndex, itemIndex, ...options }) => {
      const list = connected();
      const section = sections[sectionIndex];
      if (!Number.isInteger(sectionIndex) || !Number.isInteger(itemIndex) || !section || itemIndex < 0 || itemIndex >= section.data.length) {
        onScrollToItemFailed?.({ reason: 'invalid-target', sectionIndex, itemIndex });
        return;
      }
      const key = keyExtractor(section.data[itemIndex], itemIndex, section);
      list.scrollToKey({ ...options, key: itemKey(section.key, key) });
    },
  }), [connected, rows, sections, keyExtractor, onScrollToItemFailed]);

  const renderRow = useCallback(({ item: row }: { item: Row<T, S> }) => {
    const info = { section: row.section, sectionIndex: row.sectionIndex };
    if (row.role === 'sectionHeader') return renderSectionHeader?.(info);
    if (row.role === 'sectionFooter') return renderSectionFooter?.(info);
    if (row.role === 'item') return renderItem({ ...info, item: row.item, index: row.index, itemKey: row.itemKey });
    return null;
  }, [renderItem, renderSectionHeader, renderSectionFooter]);
  const mapTokens = useCallback((tokens: NativeListViewToken<Row<T, S>>[]) => {
    const result: NativeSectionViewToken<T, S>[] = [];
    for (const token of tokens) {
      const row = token.item;
      if (row.role !== 'item') continue;
      result.push({ item: row.item, index: row.index, key: row.itemKey, itemKey: row.itemKey,
        section: row.section, sectionIndex: row.sectionIndex, isViewable: token.isViewable });
    }
    return result;
  }, []);
  const getStickyConfig: NonNullable<NativeListProps<Row<T, S>>['getStickyConfig']> = useCallback(row => {
    if (!stickySectionHeadersEnabled || row.role !== 'sectionHeader') return undefined;
    return { group: 'sections', level: sectionStickyLevel, transition: sectionStickyTransition };
  }, [stickySectionHeadersEnabled, sectionStickyLevel, sectionStickyTransition]);

  return <NativeList
    {...listProps}
    ref={listRef}
    scrollBinding={sectionBinding}
    data={rows}
    keyExtractor={row => row.key}
    renderItem={renderRow}
    getItemType={row => row.role === 'item'
      ? JSON.stringify(['item', getItemType?.(row.item, row.index, row.section) ?? 'default'])
      : row.role}
    getItemLayout={row => ({ fullSpan: row.role !== 'item', role: row.role })}
    getStickyConfig={getStickyConfig}
    onViewableItemsChanged={onViewableItemsChanged ? info => onViewableItemsChanged({
      viewableItems: mapTokens(info.viewableItems), changed: mapTokens(info.changed),
    }) : undefined}
    onStickyHeaderChange={onStickyHeaderChange ? info => {
      const key = sectionKeyFromInternal(info.key);
      const index = key === null ? -1 : sections.findIndex(section => section.key === key);
      onStickyHeaderChange({ level: info.level, sectionKey: key,
        previousSectionKey: sectionKeyFromInternal(info.previousKey), sectionIndex: index < 0 ? null : index });
    } : undefined}
    onScrollToItemFailed={onScrollToItemFailed ? info => {
      const row = info.key ? rowByKey.get(info.key) : undefined;
      onScrollToItemFailed({ reason: info.reason, sectionIndex: row?.sectionIndex,
        sectionKey: row?.section.key ?? (info.key ? sectionKeyFromInternal(info.key) ?? undefined : undefined),
        itemIndex: row?.role === 'item' ? row.index : undefined });
    } : undefined}
  />;
}

export const NativeSectionList = forwardRef(NativeSectionListImpl) as <T, S extends NativeListSection<T> = NativeListSection<T>>(
  props: NativeSectionListProps<T, S> & RefAttributes<NativeSectionListRef>,
) => ReactElement;
