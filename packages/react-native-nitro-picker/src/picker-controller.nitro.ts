import type { HybridObject } from "react-native-nitro-modules";

export interface PickerController extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  readonly instanceId: string;
  configure(
    onStart: (revision: number) => void,
    onEnd: (index: number, revision: number, cancelled: boolean) => void,
  ): void;
  setSelection(index: number, revision: number): void;
  invalidate(): void;
}
