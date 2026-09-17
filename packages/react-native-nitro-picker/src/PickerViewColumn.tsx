import type { PickerViewColumnProps } from './types';

/** Declarative column descriptor, consumed by its direct PickerView parent. */
export function PickerViewColumn(_props: PickerViewColumnProps): null {
  throw new Error('PickerViewColumn must be a direct child of PickerView.');
}
