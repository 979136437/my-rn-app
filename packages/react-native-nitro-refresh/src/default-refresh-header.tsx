import { cn } from "cn";
import { cssInterop } from "nativewind";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { RefreshHeaderProps } from "./types";
import {
  ARROW_ANIMATION_DURATION_MS,
  DEFAULT_HEADER_ARROW,
  DEFAULT_HEADER_COLOR_CLASS,
  DEFAULT_HEADER_LABELS,
  READY_ARROW_ROTATION_DEG,
  REFRESH_STATES,
} from "./defaults";

const AnimatedText = cssInterop(Animated.Text, { className: "style" });
const StyledActivityIndicator = cssInterop(ActivityIndicator, {
  className: { target: "style", nativeStyleToProp: { color: true } },
});

export interface DefaultRefreshHeaderProps extends RefreshHeaderProps {
  className?: string;
  textClassName?: string;
  indicatorColor?: string;
  labels?: Partial<{ pulling: string; ready: string; refreshing: string }>;
}

export function DefaultRefreshHeader({
  state,
  className,
  textClassName,
  indicatorColor,
  labels,
}: DefaultRefreshHeaderProps) {
  const rotation = useSharedValue(0);
  const busy =
    state === REFRESH_STATES.refreshing || state === REFRESH_STATES.finishing;
  useEffect(() => {
    rotation.set(
      withTiming(
        state === REFRESH_STATES.ready ? READY_ARROW_ROTATION_DEG : 0,
        {
          duration: ARROW_ANIMATION_DURATION_MS,
          reduceMotion: ReduceMotion.System,
        },
      ),
    );
    return () => cancelAnimation(rotation);
  }, [state, rotation]);
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }));
  const text = busy
    ? (labels?.refreshing ?? DEFAULT_HEADER_LABELS.refreshing)
    : state === REFRESH_STATES.ready
      ? (labels?.ready ?? DEFAULT_HEADER_LABELS.ready)
      : (labels?.pulling ?? DEFAULT_HEADER_LABELS.pulling);

  return (
    <View
      className={cn(
        "h-full flex-row items-center justify-center gap-3",
        className,
      )}
      accessible
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
    >
      {busy ? (
        <StyledActivityIndicator
          className={
            indicatorColor === undefined
              ? DEFAULT_HEADER_COLOR_CLASS
              : undefined
          }
          color={indicatorColor}
        />
      ) : (
        <AnimatedText
          className={cn("text-xl", DEFAULT_HEADER_COLOR_CLASS)}
          style={arrowStyle}
          accessible={false}
        >
          {DEFAULT_HEADER_ARROW}
        </AnimatedText>
      )}
      <Text
        className={cn("text-sm", DEFAULT_HEADER_COLOR_CLASS, textClassName)}
      >
        {text}
      </Text>
    </View>
  );
}
