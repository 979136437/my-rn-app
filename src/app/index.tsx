import { Button, Column, Host, Row, Switch } from '@expo/ui';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  DefaultRefreshHeader, RefreshFlatList, RefreshScrollView,
  type RefreshHandle, type RefreshHeaderProps, type RefreshState,
} from 'react-native-refresh';

function CustomHeader(props: RefreshHeaderProps) {
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.min(props.progress.get(), 1) }],
    opacity: Math.min(props.progress.get(), 1),
  }));
  return (
    <View style={styles.customHeader}>
      <DefaultRefreshHeader {...props} />
      <Animated.View style={[styles.progress, barStyle]} />
    </View>
  );
}

export default function RefreshDemo() {
  const [list, setList] = useState(true);
  const [baseline, setBaseline] = useState(false);
  const [size, setSize] = useState(40);
  const [enabled, setEnabled] = useState(true);
  const [custom, setCustom] = useState(false);
  const [haptics, setHaptics] = useState(true);
  const [automatic, setAutomatic] = useState(true);
  const [state, setState] = useState<RefreshState>('idle');
  const [count, setCount] = useState(0);
  const refreshRef = useRef<RefreshHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const web = Platform.OS === 'web';

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const finish = () => {
    clearTimer();
    refreshRef.current?.finishRefresh();
  };
  const onRefresh = () => {
    setCount((value) => value + 1);
    clearTimer();
    if (automatic) timer.current = setTimeout(finish, 1200);
  };
  const items = Array.from({ length: size }, (_, index) => ({ id: String(index), title: `内容 ${index + 1}` }));
  const refreshProps = {
    refreshRef, onRefresh, enabled, hapticsEnabled: haptics, onStateChange: setState,
    renderHeader: custom ? (props: RefreshHeaderProps) => <CustomHeader {...props} /> : undefined,
    containerStyle: styles.viewport,
    contentContainerStyle: styles.content,
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '下拉刷新' }} />
      <View style={styles.intro}>
        <Text style={styles.title}>Pull to Refresh</Text>
        <Text style={styles.description}>
          {web ? 'Web 仅演示普通滚动，刷新与触觉反馈不可用。' : Platform.OS === 'ios'
            ? '可连续拖到顶部继续下拉，超过阈值再松手。'
            : '滚到顶部后重新下拉，超过阈值再松手。'}
        </Text>
        <Text style={styles.status}>状态：{state} · 已触发 {count} 次</Text>
      </View>
      <Host matchContents ignoreSafeArea="all" style={styles.controls}>
        <Column spacing={8}>
          <Row spacing={8}>
            <Button label="FlatList" variant={list && !baseline ? 'filled' : 'outlined'} onPress={() => {
              if (!list || baseline) { clearTimer(); setState('idle'); setList(true); setBaseline(false); }
            }} />
            <Button label="ScrollView" variant={!list && !baseline ? 'filled' : 'outlined'} onPress={() => {
              if (list || baseline) { clearTimer(); setState('idle'); setList(false); setBaseline(false); }
            }} />
            <Button label={size === 40 ? '长列表' : size === 3 ? '短列表' : '空列表'}
              variant="outlined" onPress={() => setSize((value) => value === 40 ? 3 : value === 3 ? 0 : 40)} />
          </Row>
          <Button label="原生 FlatList（滚动对照）" variant={baseline ? 'filled' : 'outlined'} onPress={() => {
            if (!baseline) { clearTimer(); setState('idle'); setBaseline(true); }
          }} />
          <Row spacing={12}>
            <Switch label="启用" value={enabled} onValueChange={setEnabled} />
            <Switch label="自定义头部" value={custom} onValueChange={setCustom} />
          </Row>
          <Row spacing={12}>
            <Switch label="触觉反馈" value={haptics} onValueChange={setHaptics} />
            <Switch label="自动结束" value={automatic} onValueChange={setAutomatic} />
          </Row>
          <Row spacing={8}>
            <Button label="开始刷新" disabled={web || baseline} onPress={() => refreshRef.current?.beginRefresh()} />
            <Button label="结束刷新" disabled={web || baseline} variant="outlined" onPress={finish} />
          </Row>
        </Column>
      </Host>
      {baseline ? (
        <FlatList style={styles.viewport} contentContainerStyle={styles.content}
          data={items} keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>暂无内容</Text>}
          renderItem={({ item }) => <Text style={styles.item}>{item.title}</Text>} />
      ) : list ? (
        <RefreshFlatList {...refreshProps} data={items} keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>暂无内容，仍可下拉刷新</Text>}
          renderItem={({ item }) => <Text style={styles.item}>{item.title}</Text>} />
      ) : (
        <RefreshScrollView {...refreshProps}>
          {items.length ? items.map((item) => <Text key={item.id} style={styles.item}>{item.title}</Text>)
            : <Text style={styles.empty}>暂无内容，仍可下拉刷新</Text>}
        </RefreshScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  intro: { paddingHorizontal: 20, paddingTop: 16, gap: 6 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  description: { color: '#475569', fontSize: 14 },
  status: { color: '#1d4ed8', fontSize: 13 },
  controls: { marginHorizontal: 16, marginVertical: 12 },
  viewport: { marginHorizontal: 16, marginBottom: 16, borderRadius: 16, backgroundColor: '#fff' },
  content: { flexGrow: 1, paddingHorizontal: 16 },
  item: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1', color: '#0f172a' },
  empty: { paddingVertical: 40, textAlign: 'center', color: '#64748b' },
  customHeader: { flex: 1, backgroundColor: '#eff6ff' },
  progress: { position: 'absolute', left: 24, right: 24, bottom: 6, height: 3, borderRadius: 2, backgroundColor: '#2563eb' },
});

