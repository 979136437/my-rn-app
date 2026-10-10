import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import {
  HALF,
  MAX_VISIBLE_ANGLE,
  MIN_DIMENSION,
  PERSPECTIVE_RADIUS_FACTOR,
} from "./defaults";

const FLAT_STYLE = {
  opacity: 1,
  transform: [{ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
};
const HIDDEN_STYLE = { opacity: 0, transform: FLAT_STYLE.transform };

export function WheelItem({
  children,
  index,
  itemHeight,
  offset,
  height,
  reducedMotion,
}: {
  children: ReactNode;
  index: number;
  itemHeight: number;
  offset: SharedValue<number>;
  height: SharedValue<number>;
  reducedMotion: SharedValue<boolean>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reducedMotion.value || height.value <= MIN_DIMENSION) {
      return FLAT_STYLE;
    }
    const radius = Math.max(itemHeight, height.value * HALF);
    const distance = index * itemHeight - offset.value;
    const angle = distance / radius;
    // Keep an identical transform while behind the cylinder. Reanimated's
    // shallow style comparison can then skip native updates for hidden rows.
    if (Math.abs(angle) >= MAX_VISIBLE_ANGLE) return HIDDEN_STYLE;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const translationZ = radius * (cosine - 1);
    const perspective = radius * PERSPECTIVE_RADIUS_FACTOR;
    const translationY =
      radius * sine - distance * (1 - translationZ / perspective);
    // Column-major P * T * Rx. Translate in depth as well as rotating each row
    // so the centers follow a cylinder instead of a flat, tilted list.
    return {
      opacity: 1,
      transform: [
        {
          matrix: [
            1,
            0,
            0,
            0,
            0,
            cosine,
            -sine,
            sine / perspective,
            0,
            sine,
            cosine,
            -cosine / perspective,
            0,
            translationY,
            translationZ,
            1 - translationZ / perspective,
          ],
        },
      ],
    };
  });

  return (
    <View
      collapsable={false}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="w-full shrink-0"
      style={{ height: itemHeight }}
    >
      {/* Keep static layout on View: the Animated host receives only runtime
          height and animation styles, so interop cannot replace its layout. */}
      <Animated.View style={[{ height: itemHeight }, animatedStyle]}>
        <View className="flex-1 items-center justify-center">{children}</View>
      </Animated.View>
    </View>
  );
}
