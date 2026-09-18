
import * as Haptics from 'expo-haptics';

// Called on the RN runtime only, never captured by a UI worklet.
export function thresholdReached() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
    if (__DEV__) console.warn('Refresh haptic feedback failed:', error);
  });
}
