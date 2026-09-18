import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const seasons = [
  { icon: '✿', label: '春日', color: '#34785d' },
  { icon: '☀', label: '盛夏', color: '#b87814' },
  { icon: '❧', label: '金秋', color: '#b05c2f' },
  { icon: '❄', label: '冬雪', color: '#487895' },
];
const years = [2024, 2025, 2026, 2027, 2028];
const months = Array.from({ length: 12 }, (_, index) => index + 1);
const choices = ['步行', '自行车', '公交', '地铁', '火车', '轮船', '飞机'];

function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}

function PickerExamples() {
  // Resolve the native module only after checking the platform and Expo Go.
  const { PickerView, PickerViewColumn } = require('react-native-nitro-picker') as typeof import('react-native-nitro-picker');
  const [season, setSeason] = useState(1);
  const [date, setDate] = useState([2, 8, 16]);
  const [selection, setSelection] = useState([4]);
  const [count, setCount] = useState(choices.length);
  const [immediate, setImmediate] = useState(false);
  const [tall, setTall] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const daysInMonth = new Date(years[date[0]], date[1] + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const shownDay = Math.min(date[2], daysInMonth - 1);
  const shownSelection = count === 0 ? -1 : Math.max(0, Math.min(selection[0], count - 1));
  const log = (message: string) => setEvents(previous => [message, ...previous].slice(0, 8));

  return <>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>自定义图文 · 单列</Text>
      <Text style={styles.copy}>非受控模式，默认选中盛夏。每项都由 React 内容组成。</Text>
      <PickerView defaultValue={[1]} onChange={({ value }) => setSeason(value[0])}
        itemHeight={48} style={styles.picker} indicatorStyle={[styles.indicator, { backgroundColor: '#e8eeea' }]}>
        <PickerViewColumn accessibilityLabel="季节" style={{ paddingVertical: 8 }}>
          {seasons.map(item => <View key={item.label} style={styles.option}>
            <Text style={[styles.icon, { color: item.color }]}>{item.icon}</Text>
            <Text style={styles.optionText}>{item.label}</Text>
          </View>)}
        </PickerViewColumn>
      </PickerView>
      <Text style={styles.result}>当前：{seasons[season]?.label}</Text>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>日期联动 · 受控模式</Text>
      <Text style={styles.copy}>年、月决定天数。切换到二月时，超出范围的日期自动收敛。</Text>
      <PickerView value={[date[0], date[1], shownDay]} onChange={({ value }) => {
        const maximum = new Date(years[value[0]], value[1] + 1, 0).getDate() - 1;
        setDate([value[0], value[1], Math.min(value[2], maximum)]);
      }} itemHeight={48} style={styles.picker} indicatorStyle={styles.indicator}>
        <PickerViewColumn accessibilityLabel="年份" style={{ flex: 1.3 }}>
          {years.map(year => <Text key={year} style={styles.optionText}>{year} 年</Text>)}
        </PickerViewColumn>
        <PickerViewColumn accessibilityLabel="月份">
          {months.map(month => <Text key={month} style={styles.optionText}>{month} 月</Text>)}
        </PickerViewColumn>
        <PickerViewColumn accessibilityLabel="日期">
          {days.map(day => <Text key={day} style={styles.optionText}>{day} 日</Text>)}
        </PickerViewColumn>
      </PickerView>
      <Text style={styles.result}>{years[date[0]]} 年 {date[1] + 1} 月 {shownDay + 1} 日</Text>
      <View style={styles.actions}>
        <Button title="设为 2024-02-29" onPress={() => setDate([0, 1, 28])} />
        <Button title="设为 2026-01-31" onPress={() => setDate([2, 0, 30])} />
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>动态选项与事件时机</Text>
      <Text style={styles.copy}>滚动过程中也可缩减或清空选项。程序定位与数据归一化不会触发 onChange。</Text>
      <View style={styles.toggle}>
        <Text style={styles.copy}>松手后提前通知 immediateChange</Text>
        <Switch accessibilityLabel="松手后提前通知" value={immediate} onValueChange={setImmediate} trackColor={{ true: '#34785d' }} />
      </View>
      <PickerView value={selection} immediateChange={immediate} itemHeight={48}
        indicatorStyle={styles.indicator}
        style={[styles.picker, { height: tall ? 308 : 220 }]}
        onChange={({ value, columnIndex }) => {
          setSelection(value);
          log(`change · 第 ${columnIndex + 1} 列 · [${value.join(', ')}]`);
        }}
        onPickStart={({ columnIndex }) => log(`start · 第 ${columnIndex + 1} 列`)}
        onPickEnd={({ columnIndex }) => log(`end · 第 ${columnIndex + 1} 列`)}>
        <PickerViewColumn accessibilityLabel="交通方式">
          {choices.slice(0, count).map(item => <Text key={item} style={styles.optionText}>{item}</Text>)}
        </PickerViewColumn>
      </PickerView>
      <Text style={styles.result}>当前：{choices[shownSelection] ?? '空列'} · 索引 {shownSelection}</Text>
      <View style={styles.actions}>
        <Button title="保留前两项" onPress={() => setCount(2)} />
        <Button title="清空" onPress={() => setCount(0)} />
        <Button title="恢复全部" onPress={() => setCount(choices.length)} />
        <Button title="选中末项" onPress={() => setSelection([count - 1])} />
        <Button title={tall ? '恢复高度' : '增大高度'} onPress={() => setTall(value => !value)} />
        <Button title="清空日志" onPress={() => setEvents([])} />
      </View>
      <View style={styles.log}>
        <Text style={styles.copy}>最近事件（最新在上）</Text>
        {events.length === 0 ? <Text style={styles.logText}>滚动后显示事件</Text> : events.map((event, index) => <Text key={index} style={styles.logText}>{event}</Text>)}
      </View>
    </View>
  </>;
}

export default function PickerDemo() {
  const insets = useSafeAreaInsets();
  const available = (Platform.OS === 'android' || Platform.OS === 'ios') && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  return <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.heading}>
      <Button title="← 首页目录" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
      <Text style={styles.title}>滚轮选择器</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
      {available ? <PickerExamples /> : <View style={styles.card}>
        <Text style={styles.cardTitle}>需要原生开发构建</Text>
        <Text style={styles.copy}>请在包含 react-native-nitro-picker 的 Android 或 iOS development build 中打开。Expo Go 无法加载自定义原生模块，Web 暂未实现。</Text>
      </View>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f4f3' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#163e36' },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#203f35' },
  copy: { color: '#526459', fontSize: 13, lineHeight: 21, flexShrink: 1 },
  picker: { backgroundColor: '#fff', borderRadius: 8 },
  indicator: {
    backgroundColor: 'rgba(36, 102, 87, 0.08)',
    borderColor: '#246657',
    borderWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  icon: { fontSize: 24 },
  optionText: { fontSize: 17, color: '#203f35', textAlign: 'center' },
  result: { color: '#246657', fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#e8eeea', borderRadius: 7 },
  buttonText: { color: '#244a40', fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.65 },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  log: { padding: 12, backgroundColor: '#f2f4f3', borderRadius: 8, gap: 4 },
  logText: { fontSize: 12, color: '#526459', lineHeight: 18 },
});
