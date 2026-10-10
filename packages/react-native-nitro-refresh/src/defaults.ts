import type { RefreshState } from "./refresh-controller.nitro";

export const REFRESH_STATES = {
  idle: "idle",
  pulling: "pulling",
  ready: "ready",
  refreshing: "refreshing",
  finishing: "finishing",
} as const satisfies Record<RefreshState, RefreshState>;
export const SUPPORTED_REFRESH_PLATFORMS = new Set<string>(["ios", "android"]);
export const HEADER_HEIGHT_LOWER_BOUND = 0;

// Native defaults and the Fabric literal default must keep this dp contract.
export const DEFAULT_HEADER_HEIGHT = 60;
export const ARROW_ANIMATION_DURATION_MS = 160;
export const READY_ARROW_ROTATION_DEG = 180;
export const DEFAULT_HEADER_ARROW = "↓";
export const DEFAULT_HEADER_COLOR_CLASS = "text-slate-500 dark:text-slate-400";
export const DEFAULT_HEADER_LABELS = {
  pulling: "下拉刷新",
  ready: "松开刷新",
  refreshing: "正在刷新",
} as const;
