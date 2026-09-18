import { useImperativeHandle } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import type { RefreshFlatListProps, RefreshHandle, RefreshScrollViewProps } from './types';

const unsupported: RefreshHandle = { beginRefresh() {}, finishRefresh() {} };

export function RefreshScrollView({
  refreshRef, onRefresh, onStateChange, enabled, headerHeight, dragRate,
  maxDragRate, hapticsEnabled, renderHeader, containerStyle, ...props
}: RefreshScrollViewProps) {
  useImperativeHandle(refreshRef, () => unsupported, []);
  return <View style={[{ flex: 1 }, containerStyle]}><ScrollView {...props} /></View>;
}

export function RefreshFlatList<T>({
  refreshRef, onRefresh, onStateChange, enabled, headerHeight, dragRate,
  maxDragRate, hapticsEnabled, renderHeader, containerStyle, ...props
}: RefreshFlatListProps<T>) {
  useImperativeHandle(refreshRef, () => unsupported, []);
  return <View style={[{ flex: 1 }, containerStyle]}><FlatList<T> {...props} /></View>;
}
