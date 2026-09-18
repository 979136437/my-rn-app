import type { ReactNode, Ref } from 'react';
import type { FlatList, FlatListProps, ScrollView, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type RefreshState = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'settling';

/** A consumer can observe values, but cannot change the refresh lifecycle. */
export type ReadonlySharedValue<T> = Pick<SharedValue<T>, 'get' | 'addListener' | 'removeListener'> & {
  readonly value: T;
};

export interface RefreshHeaderProps {
  state: ReadonlySharedValue<RefreshState>;
  distance: ReadonlySharedValue<number>;
  /** distance / headerHeight; can exceed 1 while pulling beyond the threshold. */
  progress: ReadonlySharedValue<number>;
}

export interface RefreshHandle {
  beginRefresh(): void;
  finishRefresh(): void;
}

export interface RefreshProps {
  /** Always call finishRefresh(), including when the request fails. */
  onRefresh: () => void;
  enabled?: boolean;
  renderHeader?: (props: RefreshHeaderProps) => ReactNode;
  headerHeight?: number;
  dragRate?: number;
  maxDragRate?: number;
  hapticsEnabled?: boolean;
  onStateChange?: (state: RefreshState) => void;
  refreshRef?: Ref<RefreshHandle>;
  /** Styles the outer, clipped viewport. style still styles the scrollable. */
  containerStyle?: StyleProp<ViewStyle>;
}

type ManagedProps =
  | keyof RefreshProps
  | 'refreshControl' | 'refreshing' | 'progressViewOffset'
  | 'horizontal' | 'inverted' | 'bounces' | 'alwaysBounceVertical'
  | 'alwaysBounceHorizontal' | 'overScrollMode'
  | 'contentInsetAdjustmentBehavior' | 'automaticallyAdjustContentInsets'
  | 'automaticallyAdjustKeyboardInsets' | 'renderScrollComponent';

export type RefreshScrollViewProps = Omit<ScrollViewProps, ManagedProps> & RefreshProps & {
  ref?: Ref<ScrollView>;
};

export type RefreshFlatListProps<T> = Omit<FlatListProps<T>, ManagedProps> & RefreshProps & {
  ref?: Ref<FlatList<T>>;
};
