import { Link, Stack } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import {
  PickerView,
  PickerViewColumn,
  type PickerChangeEvent,
} from "react-native-nitro-picker";

// Local demonstration data only; these are not production catalogs.
const DEMO_SEASONS = ["春", "夏", "秋", "冬"];
const DEMO_GROUPS = [
  { label: "出行", options: ["步行", "骑行", "公交", "地铁"] },
  { label: "运动", options: ["跑步", "游泳", "攀岩"] },
  { label: "休闲", options: ["阅读", "绘画", "摄影", "音乐", "电影"] },
];
const GROUP_COLUMN = 0;
const OPTION_COLUMN = 1;
const FIRST_OPTION = 0;
const LAST_OPTION_OFFSET = 1;
const SHORT_OPTION_COUNT = 2;
const DEMO_ICON = require("../../assets/images/expo-logo.png");

function DemoAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
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

export default function PickerDemo() {
  const [single, setSingle] = useState([0]);
  const [linked, setLinked] = useState([0, 0]);
  const [icons, setIcons] = useState([0]);
  const [enabled, setEnabled] = useState(true);
  const [acceptChanges, setAcceptChanges] = useState(true);
  const [shortList, setShortList] = useState(false);
  const [visible, setVisible] = useState(true);
  const [large, setLarge] = useState(false);
  const [status, setStatus] = useState("尚未滚动");
  const seasons = shortList
    ? DEMO_SEASONS.slice(FIRST_OPTION, SHORT_OPTION_COUNT)
    : DEMO_SEASONS;
  const group = DEMO_GROUPS[linked[GROUP_COLUMN]];

  function selectLinked(event: PickerChangeEvent) {
    if (!acceptChanges) return;
    setLinked(
      event.column === GROUP_COLUMN ? [event.index, FIRST_OPTION] : event.value,
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-950"
      contentContainerClassName="gap-5 px-5 pb-safe pt-safe"
    >
      <Stack.Screen options={{ headerShown: true, title: "立体滑动选择器" }} />
      <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        原生立体滚轮
      </Text>
      <Link href="/picker-tests" asChild>
        <Text className="text-blue-600 dark:text-blue-400">
          打开独立测试页 ›
        </Text>
      </Link>
      <Text className="text-sm text-slate-500 dark:text-slate-400">
        演示数据 · 拖动列查看曲面旋转、惯性和居中吸附。选项也可以包含图片与任意
        React 内容。
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <DemoAction
          label={enabled ? "禁用滚动" : "启用滚动"}
          onPress={() => setEnabled(!enabled)}
        />
        <DemoAction
          label={acceptChanges ? "拒绝变更" : "接受变更"}
          onPress={() => setAcceptChanges(!acceptChanges)}
        />
        <DemoAction
          label={visible ? "卸载单列" : "挂载单列"}
          onPress={() => setVisible(!visible)}
        />
        <DemoAction
          label={shortList ? "恢复选项" : "缩短选项"}
          onPress={() => setShortList(!shortList)}
        />
        <DemoAction
          label={large ? "默认尺寸" : "增大尺寸"}
          onPress={() => setLarge(!large)}
        />
        <DemoAction
          label="程序选末项"
          onPress={() => setSingle([seasons.length - LAST_OPTION_OFFSET])}
        />
      </View>
      <Text className="text-base font-medium text-slate-900 dark:text-slate-100">
        单列：
        {
          seasons[
            Math.min(single[FIRST_OPTION], seasons.length - LAST_OPTION_OFFSET)
          ]
        }{" "}
        · {status}
      </Text>
      {visible && (
        <PickerView
          testID="picker-demo-single"
          value={single}
          enabled={enabled}
          itemHeight={large ? 52 : 44}
          className={large ? "h-[300px]" : "h-[220px]"}
          onChange={({ value }) => {
            if (acceptChanges) setSingle(value);
          }}
          onPickStart={() => setStatus("滚动中")}
          onPickEnd={() => setStatus("已停止")}
        >
          <PickerViewColumn
            accessibilityLabel="季节"
            accessibilityValueText={
              seasons[
                Math.min(
                  single[FIRST_OPTION],
                  seasons.length - LAST_OPTION_OFFSET,
                )
              ]
            }
          >
            {seasons.map((season) => (
              <Text
                key={season}
                className="text-xl text-slate-900 dark:text-slate-100"
              >
                {season}
              </Text>
            ))}
          </PickerViewColumn>
        </PickerView>
      )}
      <Text className="text-base font-medium text-slate-900 dark:text-slate-100">
        双列联动：{group.label} / {group.options[linked[OPTION_COLUMN]]}
      </Text>
      <PickerView
        value={linked}
        enabled={enabled}
        onChange={selectLinked}
        testID="picker-demo-linked"
      >
        <PickerViewColumn
          accessibilityLabel="分类"
          accessibilityValueText={group.label}
        >
          {DEMO_GROUPS.map((entry) => (
            <Text
              key={entry.label}
              className="text-lg text-slate-900 dark:text-slate-100"
            >
              {entry.label}
            </Text>
          ))}
        </PickerViewColumn>
        <PickerViewColumn
          accessibilityLabel="活动"
          accessibilityValueText={group.options[linked[OPTION_COLUMN]]}
        >
          {group.options.map((option) => (
            <Text
              key={option}
              className="text-lg text-slate-900 dark:text-slate-100"
            >
              {option}
            </Text>
          ))}
        </PickerViewColumn>
      </PickerView>
      <Text className="text-base font-medium text-slate-900 dark:text-slate-100">
        图文选项
      </Text>
      <PickerView
        value={icons}
        enabled={enabled}
        testID="picker-demo-content"
        onChange={({ value }) => {
          if (acceptChanges) setIcons(value);
        }}
      >
        <PickerViewColumn
          accessibilityLabel="图文季节"
          accessibilityValueText={DEMO_SEASONS[icons[FIRST_OPTION]]}
        >
          {DEMO_SEASONS.map((season) => (
            <View key={season} className="flex-row items-center gap-3">
              <Image
                source={DEMO_ICON}
                className="h-7 w-7 rounded bg-indigo-600"
                resizeMode="contain"
              />
              <Text className="text-lg text-slate-900 dark:text-slate-100">
                {season}日计划
              </Text>
            </View>
          ))}
        </PickerViewColumn>
      </PickerView>
    </ScrollView>
  );
}
