import {
  CONTAINERS,
  CONTENT,
  HEADERS,
  RESULTS,
  SCENARIOS,
  SCENARIO_HELP,
} from "./config";

// Local simulation fixtures; entries pass parameters without controlling refresh.
export interface RefreshTestCase {
  id: string;
  title: string;
  instruction: string;
  params: Record<string, string | string[]>;
  invalid?: boolean;
}

export function testCaseHref(
  params: RefreshTestCase["params"],
): `/refresh-demo?${string}` {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const part of Array.isArray(value) ? value : [value])
      query.append(key, part);
  }
  return `/refresh-demo?${query}`;
}

const entry = (
  id: string,
  title: string,
  instruction: string,
  params: Record<string, string | string[]> = {},
): RefreshTestCase => ({ id, title, instruction, params });

export const REFRESH_TEST_SECTIONS = [
  {
    title: "基础体验",
    data: [entry("basic", "默认下拉刷新", SCENARIO_HELP[SCENARIOS.basic])],
  },
  {
    title: "基础矩阵 · 18 种组合",
    data: Object.values(CONTAINERS).flatMap((container) =>
      Object.values(CONTENT).flatMap((content) =>
        Object.values(HEADERS).map((header) =>
          entry(
            `${container}-${content}-${header}`,
            `${container} / ${content} / ${header}`,
            "下拉至就绪后松手；仅请求一次，版本增加，最终回到 idle。",
            { container, content, header },
          ),
        ),
      ),
    ),
  },
  {
    title: "头高度与触发距离",
    data: [
      [90, 40],
      [60, 60],
      [60, 90],
      [30, 130],
    ].map(([height, threshold]) =>
      entry(
        `distance-${height}-${threshold}`,
        `头高度 ${height} dp / 触发 ${threshold} dp`,
        "阈值以下松手取消；超过后触发。就绪后回拉再松手应取消；观察峰值进度超过 100%。",
        { headerHeight: String(height), triggerDistance: String(threshold) },
      ),
    ),
  },
  {
    title: "滚动与交互",
    data: [
      entry("non-top", "非顶部下拉", "先验证正常滚动，到顶后才允许触发刷新。", {
        initialOffset: "180",
      }),
      entry("disabled", "禁用刷新", "下拉不产生请求，内容仍可滚动。", {
        enabled: "false",
      }),
      entry("scroll-disabled", "禁用内容滚动", "内容不滚动，下拉不产生请求。", {
        scrollEnabled: "false",
      }),
      entry(
        "click",
        "行点击与拖动取消点击",
        "点击行增加点击数；从行开始拖动不应增加点击数。",
      ),
      entry(
        "lock",
        "刷新期间滚动锁定",
        "下拉后双向拖动不滚动，行仍可点击；20 秒后恢复滚动。",
        { refreshDurationMs: "20000" },
      ),
      entry(
        "navigation",
        "刷新中离开再进入",
        "下拉后返回列表，再进入本项；状态和计数重置，无旧回调。",
        { refreshDurationMs: "20000" },
      ),
      entry(
        "controlled-disabled",
        "禁用时受控刷新",
        "进入后仍自动刷新并结束。",
        { scenario: SCENARIOS.initial, enabled: "false" },
      ),
      entry(
        "begin-disabled",
        "禁用时主动请求",
        "进入后主动刷新被拒绝，请求计数保持 0。",
        { scenario: SCENARIOS.twice, enabled: "false" },
      ),
    ],
  },
  {
    title: "模拟请求结果",
    data: Object.values(RESULTS).map((result) =>
      entry(
        `result-${result}`,
        result,
        "下拉两次验证恢复；仅 success 更新版本，reject 始终不进入受控刷新。",
        { result },
      ),
    ),
  },
  {
    title: "生命周期 · 同实例行为",
    data: [
      SCENARIOS.initial,
      SCENARIOS.twice,
      SCENARIOS.disable,
      SCENARIOS.reopen,
      SCENARIOS.height,
      SCENARIOS.threshold,
      SCENARIOS.unmount,
      SCENARIOS.isolation,
    ].map((scenario) =>
      entry(`scenario-${scenario}`, scenario, SCENARIO_HELP[scenario], {
        scenario,
      }),
    ),
  },
  {
    title: "参数校验 · 应显示错误且不挂载刷新组件",
    data: [
      entry("invalid-repeated", "重复参数", "应显示 headerHeight 不可重复。", {
        headerHeight: ["60", "90"],
      }),
      entry("invalid-empty", "空参数", "应显示 headerHeight 不可为空。", {
        headerHeight: "",
      }),
      entry("invalid-unknown", "未知参数", "应显示未知参数。", {
        unknown: "value",
      }),
      entry("invalid-enum", "非法枚举", "应显示 container 可接受的枚举。", {
        container: "invalid",
      }),
      entry("invalid-boolean", "非法布尔值", "应仅接受 true / false。", {
        enabled: "1",
      }),
      ...["0", "-1", "NaN", "Infinity", "0x10", "1e3"].map((headerHeight) =>
        entry(
          `invalid-number-${headerHeight}`,
          `非法高度 ${headerHeight}`,
          "应显示正有限十进制数错误。",
          { headerHeight },
        ),
      ),
      entry(
        "invalid-overflow",
        "模拟耗时溢出",
        "应拒绝超过定时器上限的耗时。",
        { refreshDurationMs: "2147483648" },
      ),
    ].map((item) => ({ ...item, invalid: true })),
  },
  {
    title: "系统与人工验收",
    data: [
      entry(
        "appearance",
        "深色模式、大字体与安全区",
        "在系统设置中切换外观和字体后返回；说明与诊断可读，内容区域可用。",
      ),
      entry(
        "reduced-motion",
        "减少动态效果",
        "开启系统减少动态效果后进入；Lottie 应静止，结束后停止动画。",
        { header: HEADERS.lottie },
      ),
      entry(
        "cancel",
        "系统取消、反向到零与多指切换",
        "拖动时切换手指或由系统取消；不误触发、不残留滚动锁定。",
      ),
    ],
  },
];
