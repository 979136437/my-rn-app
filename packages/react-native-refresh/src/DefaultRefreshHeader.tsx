import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { RefreshHeaderProps, RefreshState } from './types';

export function DefaultRefreshHeader({ state, progress }: RefreshHeaderProps) {
  const [labelState, setLabelState] = useState<RefreshState>('idle');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const updateLabel = (next: RefreshState) => {
    if (mounted.current) setLabelState(next);
  };
  useAnimatedReaction(() => state.get(), (next, previous) => {
    if (next !== previous) scheduleOnRN(updateLabel, next);
  });
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.min(progress.get(), 1) * 180}deg` }],
  }));
  const refreshing = labelState === 'refreshing';
  return (
    <View style={styles.header} accessibilityRole="progressbar" accessibilityState={{ busy: refreshing }}>
      {refreshing ? <ActivityIndicator color="#2563eb" /> : <Animated.Text style={[styles.arrow, arrowStyle]}>↓</Animated.Text>}
      <Text style={styles.label} accessibilityLiveRegion="polite">
        {refreshing ? '正在刷新' : labelState === 'armed' ? '松开刷新' : labelState === 'settling' ? '正在收起' : '下拉刷新'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  arrow: { color: '#2563eb', fontSize: 24 },
  label: { color: '#475569', fontSize: 14 },
});
