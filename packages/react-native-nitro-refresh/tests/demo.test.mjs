import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

// Node's TS stripping needs an explicit suffix; Metro resolves extensionless imports.
const CONFIG_SPECIFIER = "./config";
registerHooks({
  resolve(specifier, context, next) {
    return next(
      specifier === CONFIG_SPECIFIER ? "./config.ts" : specifier,
      context,
    );
  },
});
const {
  parseDemoParams,
  DEMO_DEFAULTS,
  SCENARIOS,
  RESULTS,
  effectiveTrigger,
  DEMO_LIMITS,
} = await import("../../../src/components/refresh-demo/config.ts");
const { createDemoTask } =
  await import("../../../src/components/refresh-demo/task.ts");
const { REFRESH_TEST_SECTIONS, testCaseHref } =
  await import("../../../src/components/refresh-demo/test-cases.ts");

test("test catalog entries are unique and pass their intended parameter validation", () => {
  const cases = REFRESH_TEST_SECTIONS.flatMap((section) => section.data);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const item of cases) {
    const query = new URL(testCaseHref(item.params), "https://local.test")
      .searchParams;
    for (const [key, value] of Object.entries(item.params)) {
      assert.deepEqual(
        query.getAll(key),
        Array.isArray(value) ? value : [value],
      );
    }
    if (item.invalid)
      assert.throws(() => parseDemoParams(item.params), item.id);
    else assert.doesNotThrow(() => parseDemoParams(item.params), item.id);
  }
  const lifecycle = cases.map((item) => item.params.scenario);
  for (const scenario of Object.values(SCENARIOS)) {
    if (scenario !== SCENARIOS.basic) assert.ok(lifecycle.includes(scenario));
  }
  const matrix = REFRESH_TEST_SECTIONS.find((section) =>
    section.data.every(
      (item) =>
        item.params.container && item.params.content && item.params.header,
    ),
  );
  assert.equal(matrix.data.length, 18);
});
// This native-intent entry contains only URL logic (no JSX).
const { redirectSystemPath } =
  await import("../../../src/app/+native-intent.ts");

test("documented short deep link preserves query parameters", () => {
  assert.equal(
    redirectSystemPath({
      path: "myapp://refresh-demo?headerHeight=60&triggerDistance=90",
      initial: false,
    }),
    "/refresh-demo?headerHeight=60&triggerDistance=90",
  );
  for (const path of [
    "/refresh-demo?headerHeight=80",
    "myapp:///refresh-demo?headerHeight=80",
    "exp+my-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081",
    "invalid",
  ]) {
    assert.equal(redirectSystemPath({ path, initial: true }), path);
  }
});

test("defaults and omitted threshold follow the final header height", () => {
  assert.deepEqual(parseDemoParams({}), DEMO_DEFAULTS);
  const config = parseDemoParams({ headerHeight: "84" });
  assert.equal(config.triggerDistance, undefined);
  assert.equal(effectiveTrigger(config), 84);
  assert.equal(effectiveTrigger({ ...config, headerHeight: 120 }), 120);
});

test("scenario presets precede explicit parameters", () => {
  const preset = parseDemoParams({ scenario: SCENARIOS.threshold });
  assert.equal(preset.triggerDistance, 90);
  const explicit = parseDemoParams({
    scenario: SCENARIOS.threshold,
    triggerDistance: "140",
    headerHeight: "40",
    enabled: "false",
  });
  assert.equal(effectiveTrigger(explicit), 140);
  assert.equal(explicit.headerHeight, 40);
  assert.equal(explicit.enabled, false);
  assert.equal(
    parseDemoParams({ scenario: SCENARIOS.isolation }).content,
    "short",
  );
});

for (const [key, values] of Object.entries({
  scenario: Object.values(SCENARIOS),
  container: ["scroll-view", "flat-list", "section-list"],
  content: ["long", "short", "empty"],
  header: ["default", "lottie"],
  result: Object.values(RESULTS),
  enabled: ["true", "false"],
  scrollEnabled: ["true", "false"],
})) {
  test(`accepts every ${key} option`, () => {
    for (const value of values)
      assert.doesNotThrow(() => parseDemoParams({ [key]: value }));
    for (const value of ["", " ", "invalid", "TRUE", [values[0], values[0]]])
      assert.throws(() => parseDemoParams({ [key]: value }));
  });
}

for (const key of [
  "headerHeight",
  "triggerDistance",
  "refreshDurationMs",
  "initialOffset",
]) {
  test(`validates ${key} strictly`, () => {
    for (const value of ["0.5", "12", ".5"])
      assert.doesNotThrow(() => parseDemoParams({ [key]: value }));
    for (const value of [
      "",
      " ",
      "-1",
      "Infinity",
      "NaN",
      "1e3",
      "0x10",
      "12dp",
      " 12 ",
      ["12", "12"],
      "9".repeat(400),
    ])
      assert.throws(() => parseDemoParams({ [key]: value }));
    if (["headerHeight", "triggerDistance"].includes(key))
      assert.throws(() => parseDemoParams({ [key]: "0" }));
    else assert.doesNotThrow(() => parseDemoParams({ [key]: "0" }));
  });
}

test("unknown parameters fail; undefined known parameters are omitted", () => {
  assert.throws(() => parseDemoParams({ extra: "1" }), /未知参数/);
  assert.deepEqual(parseDemoParams({ headerHeight: undefined }), DEMO_DEFAULTS);
});

test("timer overflow is rejected rather than completing immediately", () => {
  assert.doesNotThrow(() =>
    parseDemoParams({ refreshDurationMs: String(DEMO_LIMITS.maxDurationMs) }),
  );
  assert.throws(
    () =>
      parseDemoParams({
        refreshDurationMs: String(DEMO_LIMITS.maxDurationMs + 1),
      }),
    /不可超过/,
  );
});

function fixture(result = RESULTS.success) {
  const callbacks = [];
  const cancelled = [];
  const events = [];
  const task = createDemoTask(
    { result, refreshDurationMs: 25 },
    {
      started: () => events.push("started"),
      completed: (success) => events.push(["completed", success]),
      rejected: () => events.push("rejected"),
    },
    (callback, duration) => {
      assert.equal(duration, 25);
      callbacks.push(callback);
      return callbacks.length;
    },
    (id) => cancelled.push(id),
  );
  return { task, events, callbacks, cancelled };
}

for (const result of [RESULTS.success, RESULTS.failure]) {
  test(`${result}: duplicate start ignored, completion and retry work`, () => {
    const f = fixture(result);
    f.task.start();
    f.task.start();
    assert.equal(f.callbacks.length, 1);
    f.callbacks[0]();
    assert.deepEqual(f.events, [
      "started",
      ["completed", result === RESULTS.success],
    ]);
    f.task.start();
    assert.equal(f.callbacks.length, 2);
    f.callbacks[0](); // stale callback from first request
    assert.equal(f.events.length, 3);
    f.callbacks[1]();
    assert.equal(f.events.length, 4);
  });
}
test("reject never starts work; controlled refresh bypasses rejection", () => {
  const f = fixture(RESULTS.reject);
  f.task.start();
  f.task.start();
  assert.deepEqual(f.events, ["rejected", "rejected"]);
  assert.equal(f.callbacks.length, 0);
  f.task.start(true);
  assert.equal(f.callbacks.length, 1);
});
test("unmount cancels pending work, late callback and later start; dispose is idempotent", () => {
  const f = fixture();
  f.task.start();
  f.task.dispose();
  f.task.dispose();
  f.callbacks[0]();
  f.task.start();
  assert.deepEqual(f.events, ["started"]);
  assert.deepEqual(f.cancelled, [1]);
});
test("disposing A does not cancel B", () => {
  const a = fixture();
  const b = fixture();
  a.task.start();
  b.task.start();
  a.task.dispose();
  a.callbacks[0]();
  b.callbacks[0]();
  assert.deepEqual(a.events, ["started"]);
  assert.deepEqual(b.events, ["started", ["completed", true]]);
});
