import { HALF, MIN_EDGE_SCALE, MAX_EDGE_SCALE } from "./defaults";

export function selectionTop(height: number, itemHeight: number) {
  // A short viewport clips the row equally above and below its center.
  return (height - itemHeight) * HALF;
}

export function wheelScale(
  distance: number,
  radius: number,
  edgeScale: number,
) {
  "worklet";
  const progress = Math.min(MAX_EDGE_SCALE, Math.abs(distance) / radius);
  // Smoothstep reaches the configured scale at the viewport edge, with zero
  // slope at both ends so rows cross the center without a size kink.
  const eased = progress * progress * (3 - 2 * progress);
  return MAX_EDGE_SCALE - (MAX_EDGE_SCALE - edgeScale) * eased;
}

export function validateEdgeScale(edgeScale: number) {
  if (
    !Number.isFinite(edgeScale) ||
    edgeScale <= MIN_EDGE_SCALE ||
    edgeScale > MAX_EDGE_SCALE
  ) {
    throw new Error("PickerView edgeScale must be a finite number in (0, 1].");
  }
}
