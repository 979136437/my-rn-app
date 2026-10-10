import { HALF } from "./defaults";

export function selectionTop(height: number, itemHeight: number) {
  // A short viewport clips the row equally above and below its center.
  return (height - itemHeight) * HALF;
}
