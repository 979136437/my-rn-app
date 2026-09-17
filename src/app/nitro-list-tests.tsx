import { Link, router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const entries = [
  { path: '/nitro-list-tests/headers', title: '头部与刷新', detail: '固定头部占位与覆盖、上下方刷新、推动与覆盖、动态高度。' },
  { path: '/nitro-list-tests/sticky', title: '分组与吸顶', detail: '多层互斥、推走与替换、自定义吸顶位置、瀑布流。' },
  { path: '/nitro-list-tests/context', title: 'Hook 与透明头部', detail: '滚动变色、标题渐显、阴影联动与实时指标。' },
  { path: '/nitro-list-tests/position', title: '平面列表定位', detail: '按 index 或 key 定位、头部避让、取消滚动与失败反馈。' },
  { path: '/nitro-list-tests/sections', title: '分组列表定位', detail: '定位分组和组内条目，检查部分空组与全空组。' },
] as const;

export default function ListTestDirectory() {
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.heading}>
      <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={styles.back}>
        <Text style={styles.backText}>← 首页目录</Text>
      </Pressable>
      <Text style={styles.title}>列表功能测试</Text>
    </View>
    <ScrollView contentContainerStyle={styles.entries}>
      <Text style={styles.description}>选择测试页面。每页独立配置，可查看指标、事件日志并重置。</Text>
      {entries.map(entry => <Link key={entry.path} href={entry.path} asChild>
        <Pressable accessibilityRole="link" style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          <View style={styles.cardHeading}><Text style={styles.cardTitle}>{entry.title}</Text><Text style={styles.arrow}>→</Text></View>
          <Text style={styles.description}>{entry.detail}</Text>
        </Pressable>
      </Link>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f4f3' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  back: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#e8eeea', borderRadius: 7 },
  backText: { color: '#244a40', fontSize: 12, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: '#163e36' },
  entries: { padding: 16, gap: 14 },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 12, gap: 8 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#203f35' },
  arrow: { fontSize: 20, color: '#246657' },
  description: { color: '#526459', fontSize: 13, lineHeight: 21 },
  pressed: { opacity: 0.65 },
});
