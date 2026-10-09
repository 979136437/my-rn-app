import type { HybridObject } from "react-native-nitro-modules";

export type RefreshState =
  "idle" | "pulling" | "ready" | "refreshing" | "finishing";

export interface RefreshPull {
  offset: number;
  progress: number;
  headerHeight: number;
  isDragging: boolean;
}

export interface RefreshController extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  readonly instanceId: string;
  configure(
    onRefresh: () => void,
    onStateChange: (state: RefreshState) => void,
    onPull: (pull: RefreshPull) => void,
  ): void;
  setRefreshing(refreshing: boolean): void;
  beginRefresh(): void;
  invalidate(): void;
}
