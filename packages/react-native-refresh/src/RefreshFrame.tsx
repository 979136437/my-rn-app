import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { DefaultRefreshHeader } from './DefaultRefreshHeader';
import type { RefreshProps } from './types';
import type { useRefresh } from './useRefresh';

export function RefreshFrame({ controller, renderHeader, containerStyle, children }: {
  controller: Omit<ReturnType<typeof useRefresh>, 'scrollRef'>;
  children: ReactNode;
} & Pick<RefreshProps, 'renderHeader' | 'containerStyle'>) {
  return (
    <GestureDetector gesture={controller.pan}>
      <View style={[styles.viewport, containerStyle]} collapsable={false}>
        <Animated.View pointerEvents="none" style={[styles.header, { height: controller.headerHeight }, controller.headerStyle]}>
          {renderHeader ? renderHeader(controller.header) : <DefaultRefreshHeader {...controller.header} />}
        </Animated.View>
        <Animated.View style={[styles.content, controller.contentStyle]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
});
