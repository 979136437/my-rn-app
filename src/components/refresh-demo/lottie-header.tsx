import loadingAnimation from "@/assets/animation/loading.json";
import { RefreshAnimation } from "@/components/refresh-animation";
import { useEffect } from "react";
import { Text, View } from "react-native";
import {
  REFRESH_STATES,
  type RefreshHeaderProps,
} from "react-native-nitro-refresh";
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const CUSTOM_HEADER_LABELS = {
  pulling: "继续下拉，更新本地数据",
  ready: "松手更新",
  refreshing: "正在更新本地数据",
};
const ANIMATION_PROGRESS = { start: 0, end: 1 } as const;
const MILLISECONDS_PER_SECOND = 1000;
const LOTTIE_REPEAT_FOREVER = -1;
const LOTTIE_CYCLE_DURATION_MS =
  ((loadingAnimation.op - loadingAnimation.ip) / loadingAnimation.fr) *
  MILLISECONDS_PER_SECOND;

export function LottieRefreshHeader({
  state,
  progress,
  isDragging,
}: RefreshHeaderProps) {
  const animationProgress = useSharedValue<number>(0);
  const reducedMotion = useReducedMotion();
  const refreshing = state === REFRESH_STATES.refreshing;
  useEffect(() => {
    if (refreshing && !reducedMotion) {
      animationProgress.set(ANIMATION_PROGRESS.start);
      animationProgress.set(
        withRepeat(
          withTiming(ANIMATION_PROGRESS.end, {
            duration: LOTTIE_CYCLE_DURATION_MS,
            easing: Easing.linear,
            reduceMotion: ReduceMotion.System,
          }),
          LOTTIE_REPEAT_FOREVER,
          false,
          undefined,
          ReduceMotion.System,
        ),
      );
    }
    return () => cancelAnimation(animationProgress);
  }, [animationProgress, reducedMotion, refreshing]);
  useEffect(() => {
    if (!refreshing || reducedMotion) {
      animationProgress.set(
        reducedMotion
          ? ANIMATION_PROGRESS.start
          : Math.min(
              Math.max(progress, ANIMATION_PROGRESS.start),
              ANIMATION_PROGRESS.end,
            ),
      );
    }
  }, [animationProgress, progress, reducedMotion, refreshing]);

  const label =
    refreshing || state === REFRESH_STATES.finishing
      ? CUSTOM_HEADER_LABELS.refreshing
      : state === REFRESH_STATES.ready
        ? CUSTOM_HEADER_LABELS.ready
        : CUSTOM_HEADER_LABELS.pulling;
  return (
    <View
      className="h-full flex-row items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-950"
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <RefreshAnimation
        source={loadingAnimation}
        progress={animationProgress}
      />
      <View className="justify-center gap-1">
        <Text className="text-sm text-indigo-600 dark:text-indigo-300">
          {label}
        </Text>
        <Text className="text-xs text-indigo-500 dark:text-indigo-300">
          进度 {Math.round(progress * 100)}% ·{" "}
          {isDragging ? "拖拽" : "回弹/静止"}
        </Text>
      </View>
    </View>
  );
}
