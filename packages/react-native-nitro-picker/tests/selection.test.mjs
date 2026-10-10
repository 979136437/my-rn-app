import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";

// Node's type stripping leaves extensionless TS imports unchanged.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.includes("react-native-nitro-picker/src/") &&
      specifier.startsWith("./")
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { normalizeIndex, optionArray, sameOptions } =
  await import("../src/selection.ts");
const { selectionTop } = await import("../src/geometry.ts");

test("selection stays centered when the viewport is shorter than a row", () => {
  assert.equal(selectionTop(20, 44), -12);
  assert.equal(selectionTop(20, 44) + 44 / 2, 20 / 2);
});

test("selection remains centered at equal, larger, odd and zero viewport sizes", () => {
  for (const height of [0, 19, 44, 45, 220, 300]) {
    for (const itemHeight of [43, 44, 52]) {
      assert.equal(
        selectionTop(height, itemHeight) + itemHeight / 2,
        height / 2,
      );
    }
  }
});

test("equivalent inline style and image props do not invalidate a moving column", () => {
  const options = () =>
    optionArray(
      createElement(
        "View",
        {
          key: "photo",
          style: [{ opacity: 1 }, { transform: [{ scale: 1 }] }],
        },
        createElement("Image", { source: { uri: "local-demo-image" } }),
      ),
    );
  assert.equal(sameOptions(options(), options()), true);
});

test("changed nested style or image content invalidates the old scroll", () => {
  const option = (uri, opacity) =>
    createElement("Image", {
      key: "photo",
      source: { uri },
      style: { opacity },
    });
  assert.equal(sameOptions(option("before", 1), option("after", 1)), false);
  assert.equal(sameOptions(option("before", 1), option("before", 0)), false);
});

test("replacement, reorder and removed props invalidate option content", () => {
  const a = createElement("Text", { key: "a" }, "A");
  const b = createElement("Text", { key: "b" }, "B");
  assert.equal(sameOptions([a, b], [b, a]), false);
  assert.equal(sameOptions(a, createElement("View", { key: "a" }, "A")), false);
  assert.equal(
    sameOptions({ removed: undefined }, { added: undefined }),
    false,
  );
});

test("non-plain prop objects retain their identity semantics", () => {
  assert.equal(sameOptions(new Date(0), new Date(1)), false);
  assert.equal(sameOptions(new Map(), new Map()), false);
});

test("missing and out-of-range indices normalize to available options", () => {
  assert.equal(normalizeIndex(undefined, 4), 0);
  assert.equal(normalizeIndex(-8, 4), 0);
  assert.equal(normalizeIndex(99, 4), 3);
  assert.equal(normalizeIndex(99, 0), -1);
});

test("non-integer and non-finite indices fail even for empty columns", () => {
  for (const value of [0.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => normalizeIndex(value, 0), /integers/);
  }
});
