import LottieView, { type AnimationObject } from "lottie-react-native";
import { cssInterop } from "nativewind";
import Animated, {
  type SharedValue,
  useAnimatedProps,
} from "react-native-reanimated";

const AnimatedLottie = cssInterop(
  Animated.createAnimatedComponent(LottieView),
  {
    className: "style",
  },
);

export function RefreshAnimation({
  source,
  progress,
}: {
  source: AnimationObject;
  progress: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => ({ progress: progress.get() }));

  return (
    <AnimatedLottie
      className="h-[48px] w-[120px]"
      source={source}
      resizeMode="cover"
      autoPlay={false}
      loop={false}
      animatedProps={animatedProps}
    />
  );
}
