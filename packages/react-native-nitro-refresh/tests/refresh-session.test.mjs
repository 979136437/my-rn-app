import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshSession } from "../src/refresh-session.ts";

function nativeController() {
  const calls = [];
  let events;
  return {
    calls,
    configure(onRefresh, onStateChange, onPull) {
      events = { onRefresh, onStateChange, onPull };
    },
    setRefreshing(value) {
      calls.push(["refreshing", value]);
    },
    beginRefresh() {
      calls.push(["begin"]);
    },
    invalidate() {
      calls.push(["invalidate"]);
    },
    get events() {
      return events;
    },
  };
}

function callbacks(log) {
  return {
    onRefresh: () => log.push("refresh"),
    onStateChange: (state) => log.push(state),
    onPull: (pull) => log.push(pull),
  };
}

test("initial controlled refresh and subsequent commands use the same instance", () => {
  const native = nativeController();
  const session = createRefreshSession(native, callbacks([]), true);
  assert.deepEqual(native.calls, [["refreshing", true]]);
  session.setRefreshing(false);
  session.beginRefresh();
  assert.deepEqual(native.calls, [
    ["refreshing", true],
    ["refreshing", false],
    ["begin"],
  ]);
});

test("latest handlers receive native state and unbounded pull progress", () => {
  const native = nativeController();
  const oldLog = [];
  const newLog = [];
  const session = createRefreshSession(native, callbacks(oldLog), false);
  session.update(callbacks(newLog));
  const pull = {
    offset: 90,
    progress: 1.5,
    headerHeight: 60,
    triggerDistance: 60,
    isDragging: true,
  };
  native.events.onRefresh();
  native.events.onStateChange("ready");
  native.events.onPull(pull);
  assert.deepEqual(oldLog, []);
  assert.deepEqual(newLog, ["refresh", "ready", pull]);
});

test("queued events and commands after unmount are ignored; cleanup is idempotent", () => {
  const native = nativeController();
  const log = [];
  const session = createRefreshSession(native, callbacks(log), false);
  session.dispose();
  session.dispose();
  native.events.onRefresh();
  native.events.onStateChange("idle");
  native.events.onPull({ offset: 0 });
  session.beginRefresh();
  session.setRefreshing(true);
  assert.deepEqual(log, []);
  assert.deepEqual(native.calls, [["refreshing", false], ["invalidate"]]);
});

test("disposing one control does not affect another control", () => {
  const first = nativeController();
  const second = nativeController();
  const firstLog = [];
  const secondLog = [];
  const a = createRefreshSession(first, callbacks(firstLog), false);
  createRefreshSession(second, callbacks(secondLog), false);
  a.dispose();
  first.events.onRefresh();
  second.events.onRefresh();
  assert.deepEqual(firstLog, []);
  assert.deepEqual(secondLog, ["refresh"]);
  assert.deepEqual(second.calls, [["refreshing", false]]);
});
