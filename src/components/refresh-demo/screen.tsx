import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  View,
} from "react-native";
import {
  NitroRefreshControl,
  REFRESH_STATES,
  type NitroRefreshControlRef,
  type RefreshPull,
  type RefreshState,
} from "react-native-nitro-refresh";
import {
  CONTAINERS,
  CONTENT,
  DEMO_LIMITS,
  HEADERS,
  SCENARIOS,
  SCENARIO_HELP,
  effectiveTrigger,
  type DemoConfig,
} from "./config";
import { LottieRefreshHeader } from "./lottie-header";
import { createDemoTask } from "./task";

const MESSAGES = {
  waiting: "本地模拟：等待下拉",
  pending: "本地模拟：刷新中",
  success: "本地模拟：成功，数据已更新",
  failure: "本地模拟：失败，保留原数据",
  rejected: "本地模拟：宿主拒绝刷新",
};
const EMPTY_SCROLL = 0;

export function RefreshDemoInstance({
  config,
  name = "A",
  onUnmount,
  initialRefresh = config.scenario === SCENARIOS.initial,
}: {
  config: DemoConfig;
  name?: string;
  onUnmount?: () => void;
  initialRefresh?: boolean;
}) {
  const refreshRef = useRef<NitroRefreshControlRef>(null);
  const scrollRef = useRef<ScrollView>(null);
  const flatRef = useRef<FlatList<number>>(null);
  const sectionRef = useRef<SectionList<number>>(null);
  const [refreshing, setRefreshing] = useState(initialRefresh);
  const [enabled, setEnabled] = useState(config.enabled);
  const [headerHeight, setHeaderHeight] = useState(config.headerHeight);
  const [triggerDistance, setTriggerDistance] = useState(
    config.triggerDistance,
  );
  const [state, setState] = useState<RefreshState>(REFRESH_STATES.idle);
  const [pull, setPull] = useState<RefreshPull | null>(null);
  const [peak, setPeak] = useState(0);
  const [dragged, setDragged] = useState(false);
  const [requests, setRequests] = useState(0);
  const [revision, setRevision] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [history, setHistory] = useState<RefreshState[]>([]);
  const [message, setMessage] = useState<string>(MESSAGES.waiting);
  const taskRef = useRef<ReturnType<typeof createDemoTask> | null>(null);
  const performed = useRef(false);
  const positioned = useRef(false);
  const rows = Array.from(
    {
      length:
        config.content === CONTENT.empty
          ? EMPTY_SCROLL
          : config.content === CONTENT.short
            ? DEMO_LIMITS.shortRows
            : DEMO_LIMITS.longRows,
    },
    (_, index) => index + 1,
  );

  useEffect(() => {
    const task = createDemoTask(config, {
      started() {
        setRefreshing(true);
        setMessage(MESSAGES.pending);
      },
      completed(success) {
        if (success) setRevision((value) => value + 1);
        setMessage(success ? MESSAGES.success : MESSAGES.failure);
        setRefreshing(false);
      },
      rejected() {
        setMessage(MESSAGES.rejected);
      },
    });
    taskRef.current = task;
    if (initialRefresh) task.start(true);
    if (config.scenario === SCENARIOS.twice) {
      refreshRef.current?.beginRefresh();
      refreshRef.current?.beginRefresh();
    }
    return () => {
      task.dispose();
      taskRef.current = null;
    };
  }, [config, initialRefresh]);

  const performScenario = (state: RefreshState) => {
    if (performed.current) return;
    if (state === REFRESH_STATES.refreshing) {
      if (config.scenario === SCENARIOS.disable) {
        performed.current = true;
        setEnabled(false);
      }
      if (config.scenario === SCENARIOS.height) {
        performed.current = true;
        setHeaderHeight((value) => value * DEMO_LIMITS.factor);
      }
      if (config.scenario === SCENARIOS.unmount) {
        performed.current = true;
        onUnmount?.();
      }
    }
    if (
      state === REFRESH_STATES.finishing &&
      config.scenario === SCENARIOS.reopen
    ) {
      performed.current = true;
      taskRef.current?.start(true);
    }
  };

  const positionContent = () => {
    if (positioned.current) return;
    positioned.current = true;
    if (config.initialOffset <= EMPTY_SCROLL) return;
    scrollRef.current?.scrollTo({ y: config.initialOffset, animated: false });
    flatRef.current?.scrollToOffset({
      offset: config.initialOffset,
      animated: false,
    });
    sectionRef.current
      ?.getScrollResponder()
      ?.scrollTo({ y: config.initialOffset, animated: false });
  };
  const control = (
    <NitroRefreshControl
      ref={refreshRef}
      enabled={enabled}
      refreshing={refreshing}
      headerHeight={headerHeight}
      triggerDistance={triggerDistance}
      onRefresh={() => {
        setRequests((value) => value + 1);
        taskRef.current?.start();
      }}
      onStateChange={(value) => {
        setState(value);
        performScenario(value);
        setHistory((previous) => [
          ...previous.slice(-DEMO_LIMITS.history),
          value,
        ]);
      }}
      onPull={(value) => {
        setPull(value);
        setPeak((previous) => Math.max(previous, value.progress));
        if (value.isDragging) {
          setDragged(true);
          if (!performed.current && config.scenario === SCENARIOS.threshold) {
            performed.current = true;
            setTriggerDistance(
              effectiveTrigger({ headerHeight, triggerDistance }) *
                DEMO_LIMITS.factor,
            );
          }
        }
      }}
      renderHeader={
        config.header === HEADERS.lottie
          ? (props) => <LottieRefreshHeader {...props} />
          : undefined
      }
    />
  );
  const renderRow = (item: number) => (
    <Pressable
      testID={`demo-${name}-row-${item}`}
      accessibilityLabel={`本地模拟数据 ${name} 第 ${item} 条`}
      onPress={() => setClicks((value) => value + 1)}
      className="mx-4 mb-2 rounded-xl bg-slate-100 p-4 dark:bg-slate-900"
    >
      <Text className="text-base text-slate-900 dark:text-slate-100">
        本地模拟数据 · 第 {item} 条
      </Text>
      <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        版本 {revision} · 点击验证行交互
      </Text>
    </Pressable>
  );
  const empty = (
    <View className="px-4 py-6">
      <Text className="text-slate-500 dark:text-slate-400">
        本地模拟：空内容，仍可下拉刷新
      </Text>
    </View>
  );
  const shared = {
    className: "flex-1",
    refreshControl: control,
    scrollEnabled: config.scrollEnabled,
    contentInsetAdjustmentBehavior: "automatic" as const,
    scrollEventThrottle: 32,
    onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) =>
      setScrollY(event.nativeEvent.contentOffset.y),
    onContentSizeChange: positionContent,
  };
  const diagnostic = `name=${name};state=${state};refreshing=${refreshing};requests=${requests};revision=${revision};clicks=${clicks};scroll=${scrollY.toFixed(1)};offset=${(pull?.offset ?? 0).toFixed(2)};progress=${(pull?.progress ?? 0).toFixed(3)};peak=${peak.toFixed(3)};dragged=${dragged};dragging=${pull?.isDragging ?? false};height=${headerHeight};trigger=${effectiveTrigger({ headerHeight, triggerDistance })};nativeTrigger=${pull?.triggerDistance ?? "none"};enabled=${enabled};events=${history.join(">")}`;
  return (
    <View className="flex-1 gap-2">
      <View className="gap-1 px-4">
        <Text selectable className="text-sm text-slate-700 dark:text-slate-300">
          {name} · {message}
        </Text>
        <Text
          testID={`demo-${name}-status`}
          accessibilityLabel={diagnostic}
          selectable
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          {state} · 请求 {requests} · 版本 {revision} · 行点击 {clicks}
          {"\n"}
          下拉 {(pull?.offset ?? 0).toFixed(1)} dp · 进度{" "}
          {Math.round((pull?.progress ?? 0) * 100)}% · 峰值{" "}
          {Math.round(peak * 100)}% · 滚动 {scrollY.toFixed(1)}
          {"\n"}
          头高度 {headerHeight} · 阈值{" "}
          {effectiveTrigger({ headerHeight, triggerDistance })} · 刷新{" "}
          {enabled ? "启用" : "禁用"}
          {"\n"}
          {history.join(" → ") || REFRESH_STATES.idle}
        </Text>
      </View>
      <View
        testID={`demo-${name}-viewport`}
        collapsable={false}
        className="flex-1"
      >
        {config.container === CONTAINERS.scroll ? (
          <ScrollView ref={scrollRef} {...shared}>
            {rows.map((item) => (
              <View key={item}>{renderRow(item)}</View>
            ))}
            {config.content === CONTENT.empty ? empty : null}
          </ScrollView>
        ) : config.container === CONTAINERS.section ? (
          <SectionList
            ref={sectionRef}
            {...shared}
            sections={rows.length ? [{ title: "本地模拟", data: rows }] : []}
            keyExtractor={String}
            renderItem={({ item }) => renderRow(item)}
            ListEmptyComponent={empty}
          />
        ) : (
          <FlatList
            ref={flatRef}
            {...shared}
            data={rows}
            extraData={revision}
            keyExtractor={String}
            renderItem={({ item }) => renderRow(item)}
            ListEmptyComponent={empty}
          />
        )}
      </View>
    </View>
  );
}

export function RefreshDemoScreen({ config }: { config: DemoConfig }) {
  const [mounted, setMounted] = useState(true);
  const isolation = config.scenario === SCENARIOS.isolation;
  const firstConfig = useMemo(
    () => (isolation ? { ...config, scenario: SCENARIOS.unmount } : config),
    [config, isolation],
  );
  const secondConfig = useMemo(
    () => ({ ...config, scenario: SCENARIOS.basic }),
    [config],
  );
  // A is removed only after the native refreshing state is observable.
  return (
    <View className="flex-1 gap-3 bg-white pb-safe pt-safe dark:bg-slate-950">
      <View className="gap-1 px-4 pt-3">
        <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          下拉刷新 · {config.scenario}
        </Text>
        <Text className="text-sm text-slate-600 dark:text-slate-300">
          {SCENARIO_HELP[config.scenario]}
        </Text>
        <Text selectable className="text-xs text-slate-500 dark:text-slate-400">
          {config.container} / {config.content} / {config.header} · 耗时{" "}
          {config.refreshDurationMs} ms · {config.result} · 滚动{" "}
          {String(config.scrollEnabled)}
        </Text>
      </View>
      {mounted ? (
        <RefreshDemoInstance
          config={firstConfig}
          initialRefresh={isolation || config.scenario === SCENARIOS.initial}
          onUnmount={() => setMounted(false)}
        />
      ) : (
        <Text
          testID="demo-A-unmounted"
          className="px-4 text-slate-600 dark:text-slate-300"
        >
          A 已卸载，待处理模拟任务已取消
        </Text>
      )}
      {isolation ? (
        <RefreshDemoInstance config={secondConfig} name="B" />
      ) : null}
    </View>
  );
}
