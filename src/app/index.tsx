import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const entries = [
  { path: '/picker-demo', title: '滚轮选择器', detail: '自定义选项、多列日期联动、动态数据与滚动事件。' },
  { path: '/list-demos/masonry', title: '瀑布流', detail: '动态高度、多类型卡片与双列布局。' },
  { path: '/list-demos/list', title: '普通列表', detail: '纵向列表、展开收藏与滚动观察。' },
  { path: '/list-demos/pagination', title: '分页加载', detail: '触底加载、失败重试、刷新与头尾内容。' },
  { path: '/list-demos/short', title: '短列表', detail: '少量条目的布局和自动补页。' },
  { path: '/list-demos/empty', title: '空列表', detail: '空状态、下拉刷新与首次加载。' },
  { path: '/list-demos/thousand', title: '1,000 条数据', detail: '千条数据的回收与滚动。' },
  { path: '/list-demos/ten-thousand', title: '10,000 条数据', detail: '万条数据的回收、定位与性能观察。' },
  { path: '/nitro-list-tests', title: '列表功能测试', detail: '固定头部、刷新位置、吸顶、透明头部与定位测试。' },
] as const;

export default function Index() {
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.heading}>
      <Text style={styles.title}>原生组件演示目录</Text>
    </View>
    <ScrollView contentContainerStyle={styles.entries}>
      <Text style={styles.description}>选择入口打开独立页面，返回后可继续其他测试。</Text>
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
