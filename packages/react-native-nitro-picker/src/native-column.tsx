import { cn } from "cn";
import { cssInterop } from "nativewind";
import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { AccessibilityInfo, type NativeSyntheticEvent } from "react-native";
import Animated, {
  cancelAnimation,
  useEvent,
  useSharedValue,
} from "react-native-reanimated";
import { NitroModules } from "react-native-nitro-modules";
import {
  ACCESSIBILITY_ACTIONS,
  DEFAULT_VIEW_HEIGHT,
  EMPTY_INDEX,
  FIRST_INDEX,
  LAST_ITEM_OFFSET,
  RECONCILE_STEP,
  SCROLL_EVENT,
} from "./defaults";
import type { PickerController } from "./picker-controller.nitro";
import { normalizeIndex, optionArray, sameOptions } from "./selection";
import NativePickerColumn, {
  type PickerScrollEvent,
} from "./specs/NativeNitroPickerColumn";
import type { PickerViewColumnProps } from "./types";
import { WheelItem } from "./wheel-item";

const AnimatedColumn = cssInterop(
  Animated.createAnimatedComponent(NativePickerColumn),
  { className: "style" },
);

interface ColumnProps extends PickerViewColumnProps {
  selected: number;
  itemHeight: number;
  enabled: boolean;
  enable3D: boolean;
  edgeScale: number;
  onSelect: (index: number) => void;
  onStart: () => void;
  onEnd: () => void;
}

export function NativeColumn({
  children,
  selected,
  itemHeight,
  enabled,
  enable3D,
  edgeScale,
  className,
  style,
  accessibilityLabel,
  accessibilityValueText,
  testID,
  onSelect,
  onStart,
  onEnd,
}: ColumnProps) {
  const options = optionArray(children);
  const offset = useSharedValue(Math.max(FIRST_INDEX, selected) * itemHeight);
  const height = useSharedValue(DEFAULT_VIEW_HEIGHT);
  // Start without 3D until the asynchronous system preference has been read.
  const reducedMotion = useSharedValue(true);
  const controller = useRef<PickerController | null>(null);
  const [controllerId, setControllerId] = useState("");
  const [, reconcile] = useState(FIRST_INDEX);
  const revision = useRef(FIRST_INDEX);
  const active = useRef(false);
  const previous = useRef({ options, selected, itemHeight, enabled });
  const latest = useRef({
    selected,
    options,
    enabled,
    onSelect,
    onStart,
    onEnd,
  });

  function finish(index: number, eventRevision: number, cancelled: boolean) {
    if (eventRevision !== revision.current || !active.current) return;
    active.current = false;
    try {
      if (!cancelled && index !== latest.current.selected) {
        latest.current.onSelect(index);
      }
    } finally {
      try {
        latest.current.onEnd();
      } finally {
        reconcile((count) => count + RECONCILE_STEP);
      }
    }
  }
  const finishLatest = useRef(finish);
  useLayoutEffect(() => {
    latest.current = { selected, options, enabled, onSelect, onStart, onEnd };
    finishLatest.current = finish;
    const old = previous.current;
    if (
      selected !== old.selected ||
      itemHeight !== old.itemHeight ||
      enabled !== old.enabled ||
      !sameOptions(options, old.options)
    ) {
      revision.current += 1;
      previous.current = { options, selected, itemHeight, enabled };
      if (active.current) {
        active.current = false;
        latest.current.onEnd();
      }
    }
    // Reapply the same index after an unaccepted user request. Native ignores
    // an unchanged selection during an ongoing gesture, but reconciles at rest.
    controller.current?.setSelection(selected, revision.current);
  });

  // The host ref is the native resource lifetime. Allocate after mounting and
  // keep the binding in React props so future Fabric commits retain its ID.
  const attachController = useCallback(
    (view: ComponentRef<typeof NativePickerColumn> | null) => {
      if (view === null) {
        active.current = false;
        controller.current?.invalidate();
        controller.current = null;
        cancelAnimation(offset);
        cancelAnimation(height);
        cancelAnimation(reducedMotion);
        return;
      }
      if (controller.current !== null) return;
      const native =
        NitroModules.createHybridObject<PickerController>("PickerController");
      native.configure(
        (eventRevision) => {
          if (
            controller.current !== native ||
            eventRevision !== revision.current ||
            active.current
          )
            return;
          active.current = true;
          latest.current.onStart();
        },
        (index, eventRevision, cancelled) => {
          if (controller.current === native) {
            finishLatest.current(index, eventRevision, cancelled);
          }
        },
      );
      controller.current = native;
      native.setSelection(latest.current.selected, revision.current);
      setControllerId(native.instanceId);
    },
    [height, offset, reducedMotion],
  );

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        preferenceChanged = true;
        reducedMotion.set(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (mounted && !preferenceChanged) reducedMotion.set(value);
      },
      () => undefined, // Keep the conservative initial preference on failure.
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [reducedMotion]);

  const onScroll = useEvent<NativeSyntheticEvent<PickerScrollEvent>>(
    (event) => {
      "worklet";
      offset.set(event.offset);
      height.set(event.height);
    },
    [SCROLL_EVENT],
  );

  return (
    <AnimatedColumn
      ref={attachController}
      controllerId={controllerId}
      itemHeight={itemHeight}
      enabled={enabled}
      onPickerScroll={onScroll}
      className={cn("h-full flex-1", className)}
      style={style}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !enabled || selected === EMPTY_INDEX }}
      accessibilityValue={{
        min: 0,
        max: Math.max(0, options.length - 1),
        now: Math.max(0, selected),
        text: accessibilityValueText,
      }}
      accessibilityActions={[
        { name: ACCESSIBILITY_ACTIONS.increment },
        { name: ACCESSIBILITY_ACTIONS.decrement },
      ]}
      onAccessibilityAction={(event) => {
        if (!enabled || selected === EMPTY_INDEX) return;
        const name = event.nativeEvent.actionName;
        if (
          name !== ACCESSIBILITY_ACTIONS.increment &&
          name !== ACCESSIBILITY_ACTIONS.decrement
        )
          return;
        const delta =
          name === ACCESSIBILITY_ACTIONS.increment
            ? LAST_ITEM_OFFSET
            : -LAST_ITEM_OFFSET;
        const next = normalizeIndex(selected + delta, options.length);
        if (next === selected) return;
        controller.current?.setSelection(next, revision.current);
        if (!active.current) {
          active.current = true;
          latest.current.onStart();
        }
        finishLatest.current(next, revision.current, false);
      }}
    >
      {options.map((option, index) => (
        <WheelItem
          key={
            typeof option === "object" && option !== null && "key" in option
              ? option.key
              : index
          }
          index={index}
          itemHeight={itemHeight}
          offset={offset}
          height={height}
          reducedMotion={reducedMotion}
          enable3D={enable3D}
          edgeScale={edgeScale}
        >
          {option}
        </WheelItem>
      ))}
    </AnimatedColumn>
  );
}
