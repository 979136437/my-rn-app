export const DEFAULT_ITEM_HEIGHT = 44;
export const DEFAULT_VIEW_HEIGHT = 220;
export const EMPTY_INDEX = -1;
export const EMPTY_OPTION_COUNT = 0;
export const FIRST_INDEX = 0;
export const MIN_DIMENSION = 0;
export const LAST_ITEM_OFFSET = 1;
export const RECONCILE_STEP = 1;
export const HALF = 0.5;
export const MAX_VISIBLE_ANGLE = Math.PI / 2;
export const PERSPECTIVE_RADIUS_FACTOR = 4;
export const DEFAULT_EDGE_SCALE = 0.6;
export const MIN_EDGE_SCALE = 0;
export const MAX_EDGE_SCALE = 1;
export const SUPPORTED_PLATFORMS = new Set(["android", "ios"]);
export const SCROLL_EVENT = "onPickerScroll";
export const ACCESSIBILITY_ACTIONS = {
  increment: "increment",
  decrement: "decrement",
} as const;
export const MASK_COLORS = {
  light: ["#ffffff", "#ffffff00"],
  dark: ["#020617", "#02061700"],
} as const;
