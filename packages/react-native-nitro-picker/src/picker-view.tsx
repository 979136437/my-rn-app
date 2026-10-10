import { cn } from "cn";
import { LinearGradient } from "expo-linear-gradient";
import { cssInterop, useColorScheme } from "nativewind";
import {
  Children,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Platform, View } from "react-native";
import {
  DEFAULT_ITEM_HEIGHT,
  DEFAULT_VIEW_HEIGHT,
  RECONCILE_STEP,
  MASK_COLORS,
  MIN_DIMENSION,
  SUPPORTED_PLATFORMS,
} from "./defaults";
import { NativeColumn } from "./native-column";
import { selectionTop } from "./geometry";
import { normalizeIndex, optionArray } from "./selection";
import type { PickerViewColumnProps, PickerViewProps } from "./types";

const StyledGradient = cssInterop(LinearGradient, { className: "style" });

/** A column declaration; PickerView mounts its options in a native container. */
export function PickerViewColumn(_props: PickerViewColumnProps): never {
  throw new Error("PickerViewColumn must be a direct child of PickerView.");
}

export function PickerView({
  value,
  children,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  enabled = true,
  onChange,
  onPickStart,
  onPickEnd,
  className,
  style,
  indicatorClassName,
  indicatorStyle,
  maskClassName,
  maskStyle,
  maskColors,
  testID,
}: PickerViewProps) {
  if (!SUPPORTED_PLATFORMS.has(Platform.OS)) {
    throw new Error("PickerView supports Android and iOS only.");
  }
  if (!Number.isFinite(itemHeight) || itemHeight <= MIN_DIMENSION) {
    throw new Error("PickerView itemHeight must be a positive finite number.");
  }
  // Validate even surplus entries rather than silently accepting invalid input.
  value.forEach((index) => normalizeIndex(index, value.length));
  const columns = Children.toArray(children).map((child) => {
    if (!isValidElement(child) || child.type !== PickerViewColumn) {
      throw new Error(
        "PickerView accepts only direct PickerViewColumn children.",
      );
    }
    return child as ReactElement<PickerViewColumnProps>;
  });
  const selection = columns.map((column, index) =>
    normalizeIndex(value[index], optionArray(column.props.children).length),
  );
  const current = useRef(selection);
  const [, reconcile] = useState(0);
  const [height, setHeight] = useState(DEFAULT_VIEW_HEIGHT);
  const { colorScheme } = useColorScheme();
  const colors = maskColors ?? MASK_COLORS[colorScheme ?? "light"];
  const indicatorTop = selectionTop(height, itemHeight);
  const edgeHeight = Math.max(MIN_DIMENSION, indicatorTop);
  useLayoutEffect(() => {
    current.current = selection;
  });

  return (
    <View
      testID={testID}
      className={cn(
        "relative h-[220px] flex-row overflow-hidden bg-white dark:bg-slate-950",
        className,
      )}
      style={style}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      {columns.map((column, columnIndex) => (
        <NativeColumn
          key={column.key ?? columnIndex}
          {...column.props}
          itemHeight={itemHeight}
          enabled={enabled}
          selected={selection[columnIndex]}
          onStart={() => onPickStart?.({ column: columnIndex })}
          onEnd={() => onPickEnd?.({ column: columnIndex })}
          onSelect={(index) => {
            const next = [...current.current];
            next[columnIndex] = index;
            current.current = next;
            try {
              onChange?.({ value: next, column: columnIndex, index });
            } finally {
              // Merge simultaneous column requests until React commits. Force
              // that commit even when the owner declines all requests.
              reconcile((count) => count + RECONCILE_STEP);
            }
          }}
        />
      ))}
      <View
        pointerEvents="none"
        className={cn(
          "absolute left-0 right-0 border-y border-slate-300 dark:border-slate-700",
          indicatorClassName,
        )}
        style={[indicatorStyle, { top: indicatorTop, height: itemHeight }]}
      />
      <View
        pointerEvents="none"
        className={cn("absolute inset-0", maskClassName)}
        style={maskStyle}
      >
        <StyledGradient
          colors={colors}
          className="absolute left-0 right-0 top-0"
          style={{ height: edgeHeight }}
        />
        <StyledGradient
          colors={[colors[1], colors[0]]}
          className="absolute bottom-0 left-0 right-0"
          style={{ height: edgeHeight }}
        />
      </View>
    </View>
  );
}
