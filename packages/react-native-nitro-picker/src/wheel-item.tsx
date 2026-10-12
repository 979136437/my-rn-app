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
import { wheelScale } from "./geometry";

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
  enable3D,
  edgeScale,
}: {
  children: ReactNode;
  index: number;
  itemHeight: number;
  offset: SharedValue<number>;
  height: SharedValue<number>;
  reducedMotion: SharedValue<boolean>;
  enable3D: boolean;
  edgeScale: number;
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
    const cosine = enable3D ? Math.cos(angle) : 1;
    const sine = enable3D ? Math.sin(angle) : 0;
    const scale = wheelScale(distance, height.value * HALF, edgeScale);
    const translationZ = radius * (cosine - 1);
    const perspective = radius * PERSPECTIVE_RADIUS_FACTOR;
    const translationY = enable3D
      ? radius * sine - distance * (1 - translationZ / perspective)
      : 0;
    // Column-major P * T * Rx * Sxy. Scale the content around its own center,
    // preserving the cylinder's position and depth as rows shrink at the ends.
    return {
      opacity: 1,
      transform: [
        {
          matrix: [
            scale,
            0,
            0,
            0,
            0,
            cosine * scale,
            -sine * scale,
            (sine * scale) / perspective,
            0,
            sine,
            cosine,
            enable3D ? -cosine / perspective : 0,
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
