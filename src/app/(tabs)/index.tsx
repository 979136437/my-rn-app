import { delay, random } from "@/utils";
import { useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import {
  DefaultRefreshHeader,
  NitroRefreshControl,
  type NitroRefreshControlRef,
  type RefreshPull,
  type RefreshState,
} from "react-native-nitro-refresh";

type Demo = "list" | "short" | "custom";
// Local demonstration values; production data does not depend on this screen.
const rows = Array.from({ length: 30 }, (_, index) => index + 1);
const CUSTOM_HEADER_HEIGHT = 80;
const CUSTOM_INDICATOR_COLOR = "#6366f1";
const SCROLL_EVENT_THROTTLE_MS = 32;

function DemoButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="rounded-lg bg-indigo-600 px-3 py-2 disabled:opacity-40"
    >
      <Text className="text-sm font-medium text-white">{label}</Text>
    </Pressable>
  );
}

function RefreshDemo({ mode }: { mode: Demo }) {
  const refreshRef = useRef<NitroRefreshControlRef>(null);
  const listRef = useRef<FlatList<number>>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [state, setState] = useState<RefreshState>("idle");
  const [pull, setPull] = useState<RefreshPull>({
    offset: 0,
    progress: 0,
    headerHeight: 0,
    isDragging: false,
  });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState("下拉列表开始，或点击主动刷新");
  const [scrollY, setScrollY] = useState(0);
  const [rowClicks, setRowClicks] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const onRefresh = async () => {
    setRefreshing(true);
    setResult("刷新中：点击完成或失败结束");
    await delay(random(1000, 3000));
    setRefreshing(false);
    setResult("刷新完成");
  };

  const control = (
    <NitroRefreshControl
      ref={refreshRef}
      refreshing={refreshing}
      enabled={enabled}
      onRefresh={onRefresh}
      onStateChange={setState}
      onPull={setPull}
      headerHeight={mode === "custom" ? CUSTOM_HEADER_HEIGHT : undefined}
      renderHeader={
        mode === "custom"
          ? (header) => (
              <View className="h-full justify-center bg-indigo-50 dark:bg-indigo-950">
                <DefaultRefreshHeader
                  {...header}
                  className="h-auto py-2"
                  textClassName="text-indigo-600 dark:text-indigo-300"
                  indicatorColor={CUSTOM_INDICATOR_COLOR}
                  labels={{
                    pulling: "继续下拉，更新本地数据",
                    ready: "松手更新",
                    refreshing: "正在更新本地数据",
                  }}
                />
                <Text className="text-center text-xs text-indigo-500 dark:text-indigo-300">
                  进度 {Math.round(header.progress * 100)}% ·{" "}
                  {header.isDragging ? "拖拽" : "回弹/静止"}
                </Text>
              </View>
            )
          : undefined
      }
    />
  );
  return (
    <View className="flex-1">
      <View className="gap-3 px-4 pb-4">
        <View className="flex-row flex-wrap gap-2">
          <DemoButton
            label="主动刷新"
            disabled={!enabled || state !== "idle"}
            onPress={() => refreshRef.current?.beginRefresh()}
          />
          <DemoButton
            label="完成"
            disabled={!refreshing}
            onPress={() => {
              setRevision((value) => value + 1);
              setRefreshing(false);
              setResult("刷新成功，列表版本已更新");
            }}
          />
          <DemoButton
            label="失败"
            disabled={!refreshing}
            onPress={() => {
              setRefreshing(false);
              setResult("模拟刷新失败，保留原有数据");
            }}
          />
          <DemoButton
            label={enabled ? "禁用刷新" : "启用刷新"}
            onPress={() => setEnabled((value) => !value)}
          />
          <DemoButton
            label="滚到顶部"
            onPress={() => {
              listRef.current?.scrollToOffset({ offset: 0 });
              scrollRef.current?.scrollTo({ y: 0 });
            }}
          />
          <DemoButton
            label="滚到第5条"
            onPress={() => listRef.current?.scrollToIndex({ index: 4 })}
            disabled={mode === "short"}
          />
          <DemoButton
            label={scrollEnabled ? "关闭列表滚动" : "开启列表滚动"}
            onPress={() => setScrollEnabled((value) => !value)}
          />
        </View>
        <Text className="text-sm text-slate-700 dark:text-slate-300">
          {result}
        </Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400">
          {state} · 下拉 {pull.offset.toFixed(0)}dp /{" "}
          {Math.round(pull.progress * 100)}% · 滚动 {scrollY.toFixed(0)} · 版本{" "}
          {revision} · 行点击 {rowClicks}
        </Text>
      </View>
      {mode === "short" ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          refreshControl={control}
          onScroll={(event) => setScrollY(event.nativeEvent.contentOffset.y)}
          onMomentumScrollEnd={(event) =>
            setScrollY(event.nativeEvent.contentOffset.y)
          }
          scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
          scrollEnabled={scrollEnabled}
        >
          <View className="mx-4 rounded-xl bg-slate-100 p-5 dark:bg-slate-900">
            <Text className="text-base text-slate-900 dark:text-slate-100">
              内容不足一屏也可以下拉刷新
            </Text>
            <Text className="mt-2 text-sm text-slate-500">
              本地数据版本：{revision}
            </Text>
            <DemoButton
              label="行内点击"
              onPress={() => setRowClicks((value) => value + 1)}
            />
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          className="flex-1"
          data={rows}
          extraData={revision}
          keyExtractor={(item) => String(item)}
          refreshControl={control}
          onScroll={(event) => setScrollY(event.nativeEvent.contentOffset.y)}
          onMomentumScrollEnd={(event) =>
            setScrollY(event.nativeEvent.contentOffset.y)
          }
          scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
          scrollEnabled={scrollEnabled}
          renderItem={({ item }) => (
            <View className="mx-4 mb-2 rounded-xl bg-slate-100 p-4 dark:bg-slate-900">
              <Text className="text-base text-slate-900 dark:text-slate-100">
                第 {item} 条本地数据
              </Text>
              <Text className="mt-1 text-sm text-slate-500">
                版本 {revision}
              </Text>
              <DemoButton
                label={`点击第${item}条`}
                onPress={() => setRowClicks((value) => value + 1)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Demo>("list");
  return (
    <View className="flex-1 bg-white p-safe dark:bg-slate-950">
      <Text className="px-4 pb-3 pt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
        Nitro 下拉刷新
      </Text>
      <View className="flex-row gap-2 px-4 pb-4">
        <DemoButton label="默认列表" onPress={() => setMode("list")} />
        <DemoButton label="短内容" onPress={() => setMode("short")} />
        <DemoButton label="自定义 Header" onPress={() => setMode("custom")} />
      </View>
      <RefreshDemo key={mode} mode={mode} />
    </View>
  );
}
