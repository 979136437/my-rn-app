// Local demonstration fixtures, never production refresh policy.
export const CONTAINERS = {
  scroll: "scroll-view",
  flat: "flat-list",
  section: "section-list",
} as const;
export const CONTENT = {
  long: "long",
  short: "short",
  empty: "empty",
} as const;
export const HEADERS = { default: "default", lottie: "lottie" } as const;
export const RESULTS = {
  success: "success",
  failure: "failure",
  reject: "reject",
} as const;
export const SCENARIOS = {
  basic: "basic",
  initial: "initial-refresh",
  twice: "begin-twice",
  disable: "disable-refreshing",
  reopen: "reopen-finishing",
  height: "update-height",
  threshold: "update-threshold",
  unmount: "unmount-refreshing",
  isolation: "two-instances",
} as const;
type Value<T> = T[keyof T];
export interface DemoConfig {
  scenario: Value<typeof SCENARIOS>;
  container: Value<typeof CONTAINERS>;
  content: Value<typeof CONTENT>;
  header: Value<typeof HEADERS>;
  headerHeight: number;
  triggerDistance?: number;
  enabled: boolean;
  scrollEnabled: boolean;
  result: Value<typeof RESULTS>;
  refreshDurationMs: number;
  initialOffset: number;
}
export const DEMO_DEFAULTS: DemoConfig = {
  scenario: SCENARIOS.basic,
  container: CONTAINERS.flat,
  content: CONTENT.long,
  header: HEADERS.default,
  headerHeight: 60,
  enabled: true,
  scrollEnabled: true,
  result: RESULTS.success,
  refreshDurationMs: 1500,
  initialOffset: 0,
};
export const SCENARIO_PRESETS: Partial<
  Record<DemoConfig["scenario"], Partial<DemoConfig>>
> = {
  [SCENARIOS.threshold]: { triggerDistance: 90 },
  [SCENARIOS.isolation]: { content: CONTENT.short },
};
export const SCENARIO_HELP: Record<DemoConfig["scenario"], string> = {
  [SCENARIOS.basic]: "下拉并松手；刷新自动结束。滚动和点击数据行验证手势。",
  [SCENARIOS.initial]: "进入后受控刷新，自动结束；不会产生 onRefresh 请求。",
  [SCENARIOS.twice]: "挂载后连续主动刷新两次，应仅收到一次请求。",
  [SCENARIOS.disable]: "下拉刷新后自动禁用刷新；当前任务仍应正常结束。",
  [SCENARIOS.reopen]: "首次结束期间再次受控刷新；第二次自动结束，不增加请求。",
  [SCENARIOS.height]:
    "首次刷新时头高度翻倍，保持同一实例；未指定阈值时阈值同步跟随。",
  [SCENARIOS.threshold]:
    "首次拖动时触发距离翻倍，保持同一实例；继续拖动验证就绪状态。",
  [SCENARIOS.unmount]: "首次刷新时卸载组件；等待任务耗时后不应再更新数据。",
  [SCENARIOS.isolation]: "A 初始受控刷新并在刷新中卸载，B 保持可独立下拉刷新。",
};
export const DEMO_LIMITS = {
  minimum: 0,
  // JS timers overflow above a signed 32-bit millisecond duration.
  maxDurationMs: 2_147_483_647,
  factor: 2,
  longRows: 30,
  shortRows: 2,
  history: 16,
} as const;
const BOOLEAN_TEXT = { yes: "true", no: "false" } as const;
const NUMERIC_TEXT = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const ENUMS = {
  scenario: SCENARIOS,
  container: CONTAINERS,
  content: CONTENT,
  header: HEADERS,
  result: RESULTS,
};
const PARAMETER_KEYS = {
  height: "headerHeight",
  threshold: "triggerDistance",
  duration: "refreshDurationMs",
  offset: "initialOffset",
  enabled: "enabled",
  scroll: "scrollEnabled",
} as const;
const NUMBERS = new Set<string>([
  PARAMETER_KEYS.height,
  PARAMETER_KEYS.threshold,
  PARAMETER_KEYS.duration,
  PARAMETER_KEYS.offset,
]);
const BOOLEANS = new Set<string>([
  PARAMETER_KEYS.enabled,
  PARAMETER_KEYS.scroll,
]);
const POSITIVE = new Set<string>([
  PARAMETER_KEYS.height,
  PARAMETER_KEYS.threshold,
]);
const KEYS = new Set([...Object.keys(DEMO_DEFAULTS), PARAMETER_KEYS.threshold]);
export type RouteParams = Record<string, string | string[] | undefined>;

export function parseDemoParams(params: RouteParams): DemoConfig {
  const overrides: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (!KEYS.has(key)) throw new Error(`未知参数：${key}`);
    if (raw === undefined) continue;
    if (Array.isArray(raw)) throw new Error(`参数不可重复：${key}`);
    if (!raw.trim()) throw new Error(`参数不可为空：${key}`);
    if (key in ENUMS) {
      const values: readonly string[] = Object.values(
        ENUMS[key as keyof typeof ENUMS],
      );
      if (!values.includes(raw))
        throw new Error(`${key} 必须为 ${values.join(" / ")}`);
      overrides[key] = raw;
    } else if (BOOLEANS.has(key)) {
      if (raw !== BOOLEAN_TEXT.yes && raw !== BOOLEAN_TEXT.no)
        throw new Error(`${key} 必须为 true / false`);
      overrides[key] = raw === BOOLEAN_TEXT.yes;
    } else if (NUMBERS.has(key)) {
      const value = Number(raw);
      if (
        !NUMERIC_TEXT.test(raw) ||
        !Number.isFinite(value) ||
        value < DEMO_LIMITS.minimum ||
        (POSITIVE.has(key) && value <= DEMO_LIMITS.minimum)
      ) {
        throw new Error(
          `${key} 必须为${POSITIVE.has(key) ? "正" : "非负"}有限十进制数`,
        );
      }
      if (
        key === PARAMETER_KEYS.duration &&
        value > DEMO_LIMITS.maxDurationMs
      ) {
        throw new Error(`${key} 不可超过 ${DEMO_LIMITS.maxDurationMs} ms`);
      }
      overrides[key] = value;
    }
  }
  const scenario = (overrides.scenario ??
    DEMO_DEFAULTS.scenario) as DemoConfig["scenario"];
  return {
    ...DEMO_DEFAULTS,
    ...SCENARIO_PRESETS[scenario],
    ...overrides,
  } as DemoConfig;
}

export function effectiveTrigger(
  config: Pick<DemoConfig, "headerHeight" | "triggerDistance">,
) {
  return config.triggerDistance ?? config.headerHeight;
}
