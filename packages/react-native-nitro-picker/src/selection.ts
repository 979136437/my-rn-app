import { Children, isValidElement, type ReactNode } from "react";
import {
  EMPTY_INDEX,
  EMPTY_OPTION_COUNT,
  FIRST_INDEX,
  LAST_ITEM_OFFSET,
} from "./defaults";

export function normalizeIndex(index: number | undefined, count: number) {
  const requested = index ?? FIRST_INDEX;
  if (!Number.isInteger(requested)) {
    throw new Error("PickerView indices must be finite integers.");
  }
  return count === EMPTY_OPTION_COUNT
    ? EMPTY_INDEX
    : Math.max(FIRST_INDEX, Math.min(requested, count - LAST_ITEM_OFFSET));
}

// Compare rendered option identity/content rather than array identity: a parent
// rerender must not interrupt a different column that is still being dragged.
const OBJECT_TYPE = "object";

export function sameOptions(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (isValidElement(left) && isValidElement(right)) {
    if (left.type !== right.type || left.key !== right.key) return false;
    return sameOptions(left.props, right.props);
  }
  if (
    typeof left === OBJECT_TYPE &&
    left !== null &&
    typeof right === OBJECT_TYPE &&
    right !== null &&
    Object.getPrototypeOf(left) === Object.prototype &&
    Object.getPrototypeOf(right) === Object.prototype
  ) {
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameOptions(a[key], b[key]))
    );
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => sameOptions(item, right[index]))
    );
  }
  return false;
}

export function optionArray(children: ReactNode) {
  return Children.toArray(children);
}
