import { Link, Stack } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { PickerView, PickerViewColumn } from "react-native-nitro-picker";

// Local test data only. Nothing on this screen is a production catalog.
const TEST_OPTIONS = ["春", "夏", "秋", "冬", "雨", "雪", "风", "晴"];
const TEST_IMAGE = require("../../assets/images/expo-logo.png");
const FIRST_COLUMN = 0;
const FIRST_OPTION = 0;
const LAST_OFFSET = 1;
const STEP = 1;
const SHORT_COUNT = 3;
const LOG_LIMIT = 30;
const OUT_OF_RANGE = 99;
const DEFAULT_EDGE_SCALE = 0.6;
const STRONG_EDGE_SCALE = 0.4;
const NO_EDGE_SCALE = 1;
const START_ACTION = {
  none: "none",
  unmount: "unmount",
  update: "update",
  replace: "replace",
} as const;

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-lg bg-slate-200 px-3 py-2 dark:bg-slate-800"
    >
      <Text className="text-sm text-slate-900 dark:text-slate-100">
        {label}
      </Text>
    </Pressable>
  );
}

export default function PickerTests() {
  const [value, setValue] = useState<number[]>([0, 0]);
  const [count, setCount] = useState(TEST_OPTIONS.length);
  const [reversed, setReversed] = useState(false);
  const [replacement, setReplacement] = useState(false);
  const [accept, setAccept] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [visible, setVisible] = useState(true);
  const [large, setLarge] = useState(false);
  const [compact, setCompact] = useState(false);
  const [enable3D, setEnable3D] = useState(true);
  const [edgeScale, setEdgeScale] = useState(DEFAULT_EDGE_SCALE);
  const [linked, setLinked] = useState(false);
  const [renderCount, setRenderCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [startAction, setStartAction] = useState<string>(START_ACTION.none);
  const options = TEST_OPTIONS.slice(FIRST_OPTION, count);
  if (reversed) options.reverse();
  const rightOptions = linked
    ? options.slice(
        FIRST_OPTION,
        Math.max(STEP, options.length - (value[FIRST_COLUMN] ?? FIRST_OPTION)),
      )
    : options;

  function record(message: string) {
    setLogs((previous) =>
      [message, ...previous].slice(FIRST_OPTION, LOG_LIMIT),
    );
  }

  function program(next: number[]) {
    setValue(next);
    record(`程序更新 [${next.join(", ")}]；应无 change，滚动中允许 end`);
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-950"
      contentContainerClassName="gap-4 px-4 pb-safe pt-4"
    >
      <Stack.Screen options={{ headerShown: true, title: "选择器测试" }} />
      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        原生双列测试 · 本地演示数据
      </Text>
      <Text className="text-sm text-slate-600 dark:text-slate-300">
        同时拖动两列，或甩动后操作下方按钮。图文选项刻意使用内联
        style/source，事件日志导致的重渲染应不打断另一列。
      </Text>
      <Link href="/picker-demo" asChild>
        <Text className="text-blue-600 dark:text-blue-400">
          打开完整展示页 ›
        </Text>
      </Link>
      <Text
        testID="picker-tests-controlled"
        selectable
        className="text-base text-slate-900 dark:text-slate-100"
      >
        受控值 [{value.join(", ")}] · 列项数 {options.length}/
        {rightOptions.length} · 重渲染 {renderCount}
      </Text>
      {visible && (
        <PickerView
          testID="picker-tests-wheel"
          value={value}
          enabled={enabled}
          enable3D={enable3D}
          edgeScale={edgeScale}
          itemHeight={large ? 52 : 44}
          className={compact ? "h-[20px]" : large ? "h-[300px]" : "h-[220px]"}
          onPickStart={({ column }) => {
            record(`start 列 ${column}`);
            if (startAction === START_ACTION.unmount) setVisible(false);
            if (startAction === START_ACTION.update)
              program([
                options.length - LAST_OFFSET,
                rightOptions.length - LAST_OFFSET,
              ]);
            if (startAction === START_ACTION.replace) setCount(SHORT_COUNT);
            setStartAction(START_ACTION.none);
          }}
          onPickEnd={({ column }) => record(`end 列 ${column}`)}
          onChange={(event) => {
            record(
              `change 列 ${event.column} → ${event.index} [${event.value.join(", ")}] ${accept ? "接受" : "拒绝"}`,
            );
            if (accept) {
              setValue(
                linked && event.column === FIRST_COLUMN
                  ? [event.index, FIRST_OPTION]
                  : event.value,
              );
            }
          }}
        >
          <PickerViewColumn
            testID="picker-tests-text"
            accessibilityLabel="文本测试列"
          >
            {options.map((option) => (
              <Text
                key={option}
                className="text-xl text-slate-900 dark:text-slate-100"
              >
                {replacement ? `${option}·新` : option}
              </Text>
            ))}
          </PickerViewColumn>
          <PickerViewColumn
            testID="picker-tests-image"
            accessibilityLabel="图文测试列"
          >
            {rightOptions.map((option) => (
              <View
                key={option}
                className="flex-row items-center gap-2"
                style={{ opacity: 1 }}
              >
                <Image
                  source={{ uri: Image.resolveAssetSource(TEST_IMAGE).uri }}
                  className="h-6 w-6 rounded bg-indigo-600"
                  resizeMode="contain"
                />
                <Text className="text-lg text-slate-900 dark:text-slate-100">
                  {replacement ? `${option}·新` : option}
                </Text>
              </View>
            ))}
          </PickerViewColumn>
        </PickerView>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Action
          label="程序选首项"
          onPress={() => program([FIRST_OPTION, FIRST_OPTION])}
        />
        <Action
          label="程序选末项"
          onPress={() =>
            program([
              options.length - LAST_OFFSET,
              rightOptions.length - LAST_OFFSET,
            ])
          }
        />
        <Action
          label="越界值"
          onPress={() => program([OUT_OF_RANGE, -OUT_OF_RANGE])}
        />
        <Action label="缺省索引" onPress={() => program([])} />
        <Action
          label={accept ? "拒绝变更" : "接受变更"}
          onPress={() => setAccept(!accept)}
        />
        <Action
          label={enabled ? "禁用" : "启用"}
          onPress={() => setEnabled(!enabled)}
        />
        <Action
          label={visible ? "卸载" : "重新挂载"}
          onPress={() => setVisible(!visible)}
        />
        <Action label="清空列" onPress={() => setCount(FIRST_OPTION)} />
        <Action label="缩短列" onPress={() => setCount(SHORT_COUNT)} />
        <Action label="恢复列" onPress={() => setCount(TEST_OPTIONS.length)} />
        <Action label="反转顺序" onPress={() => setReversed(!reversed)} />
        <Action
          label="等数量替换内容"
          onPress={() => setReplacement(!replacement)}
        />
        <Action
          label={linked ? "关闭联动" : "开启联动"}
          onPress={() => {
            setLinked(!linked);
            program([FIRST_OPTION, FIRST_OPTION]);
          }}
        />
        <Action
          label={large ? "默认尺寸" : "增大尺寸"}
          onPress={() => setLarge(!large)}
        />
        <Action
          label={compact ? "恢复高度" : "高度小于行高"}
          onPress={() => setCompact(!compact)}
        />
        <Action
          label="无关重渲染"
          onPress={() => setRenderCount((previous) => previous + STEP)}
        />
        <Action label="清空日志" onPress={() => setLogs([])} />
        <Action
          label={enable3D ? "关闭立体" : "开启立体"}
          onPress={() => setEnable3D(!enable3D)}
        />
        <Action
          label="增强缩放"
          onPress={() => setEdgeScale(STRONG_EDGE_SCALE)}
        />
        <Action
          label="默认缩放"
          onPress={() => setEdgeScale(DEFAULT_EDGE_SCALE)}
        />
        <Action label="关闭缩放" onPress={() => setEdgeScale(NO_EDGE_SCALE)} />
        <Action
          label="滚动开始即卸载"
          onPress={() => setStartAction(START_ACTION.unmount)}
        />
        <Action
          label="滚动开始即更新值"
          onPress={() => setStartAction(START_ACTION.update)}
        />
        <Action
          label="滚动开始即缩短列"
          onPress={() => setStartAction(START_ACTION.replace)}
        />
      </View>
      <Text
        testID="picker-tests-appearance"
        className="text-sm text-slate-600 dark:text-slate-300"
      >
        立体：{enable3D ? "开启" : "关闭"} · 边缘缩放：{edgeScale}
      </Text>
      <Text
        testID="picker-tests-start-action"
        className="text-sm text-slate-600 dark:text-slate-300"
      >
        下一次滚动开始操作：{startAction}
      </Text>
      <Text className="text-sm text-slate-600 dark:text-slate-300">
        窄高度验收：高度小于行高时，选中内容应仍在容器中心，上下均匀裁切；首尾均可吸附到中心。
        验收：首尾正面居中；吸附后 change 再 end；同项无
        change；拒绝后复位；清空后无选项；联动更新后旧回调不能覆盖新值；卸载后无迟到事件。
        深浅主题、减少动态效果及 VoiceOver/TalkBack
        请在系统设置切换后检查。外层页面可滚动，用于检查手势协调。
      </Text>
      <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
        事件日志（最新在前，最多 {LOG_LIMIT} 条）
      </Text>
      <Text
        testID="picker-tests-events"
        selectable
        className="font-mono text-xs text-slate-700 dark:text-slate-300"
      >
        {logs.join("\n") || "尚无记录；记录实际回调与程序操作。"}
      </Text>
    </ScrollView>
  );
}
