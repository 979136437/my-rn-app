import { useImperativeHandle } from 'react';
import type { Ref } from 'react';
import { FlatList, Platform, ScrollView } from 'react-native';
import type { ScrollViewProps } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { RefreshFrame } from './RefreshFrame';
import { useRefresh } from './useRefresh';
import type { RefreshFlatListProps, RefreshScrollViewProps } from './types';

// VirtualizedList injects its own ref and children into renderScrollComponent.
// Forward that ref to the same ScrollView observed by the refresh controller.
function ListScrollView({ controller, ref, ...props }: ScrollViewProps & {
  controller: ReturnType<typeof useRefresh<ScrollView>>;
  ref?: Ref<ScrollView>;
}) {
  useImperativeHandle(ref, () => controller.scrollRef.current!, [controller.scrollRef]);
  return (
    <GestureDetector gesture={controller.nativeGesture}>
      <Animated.ScrollView {...props} {...managedScrollProps}
        ref={controller.scrollRef} animatedProps={controller.animatedProps} />
    </GestureDetector>
  );
}

const managedScrollProps = {
  horizontal: false,
  bounces: Platform.OS === 'ios',
  alwaysBounceVertical: Platform.OS === 'ios',
  alwaysBounceHorizontal: false,
  overScrollMode: 'never',
  contentInsetAdjustmentBehavior: 'never',
  automaticallyAdjustContentInsets: false,
  automaticallyAdjustKeyboardInsets: false,
  refreshControl: undefined,
  refreshing: undefined,
} as const;

export function RefreshScrollView({
  ref, refreshRef, onRefresh, onStateChange, enabled, headerHeight, dragRate,
  maxDragRate, hapticsEnabled, renderHeader, containerStyle, ...props
}: RefreshScrollViewProps) {
  const controller = useRefresh<ScrollView>({
    refreshRef, onRefresh, onStateChange, enabled, headerHeight, dragRate, maxDragRate,
    hapticsEnabled, scrollEnabled: props.scrollEnabled, contentInset: props.contentInset,
    contentOffset: props.contentOffset,
  }, ref);
  return (
    <RefreshFrame controller={controller} renderHeader={renderHeader} containerStyle={containerStyle}>
      <GestureDetector gesture={controller.nativeGesture}>
        <Animated.ScrollView {...props} {...managedScrollProps}
          ref={controller.scrollRef} scrollEventThrottle={props.scrollEventThrottle ?? 16}
          animatedProps={controller.animatedProps} />
      </GestureDetector>
    </RefreshFrame>
  );
}

export function RefreshFlatList<T>({
  ref, refreshRef, onRefresh, onStateChange, enabled, headerHeight, dragRate,
  maxDragRate, hapticsEnabled, renderHeader, containerStyle, ...props
}: RefreshFlatListProps<T>) {
  const controller = useRefresh<ScrollView>({
    refreshRef, onRefresh, onStateChange, enabled, headerHeight, dragRate, maxDragRate,
    hapticsEnabled, scrollEnabled: props.scrollEnabled, contentInset: props.contentInset,
    contentOffset: props.contentOffset,
  });
  return (
    <RefreshFrame controller={controller} renderHeader={renderHeader} containerStyle={containerStyle}>
      <FlatList<T> {...props} {...managedScrollProps} inverted={false} onRefresh={undefined}
        ref={ref} renderScrollComponent={(scrollProps) => (
          <ListScrollView {...scrollProps} controller={controller} />
        )} />
    </RefreshFrame>
  );
}
