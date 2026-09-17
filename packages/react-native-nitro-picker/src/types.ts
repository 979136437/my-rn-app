import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface PickerChangeEvent {
  value: number[];
  columnIndex: number;
}

export interface PickerScrollEvent {
  columnIndex: number;
}

export interface PickerViewProps {
  children?: ReactNode;
  value?: readonly number[];
  defaultValue?: readonly number[];
  onChange?: (event: PickerChangeEvent) => void;
  itemHeight?: number;
  immediateChange?: boolean;
  indicatorStyle?: StyleProp<ViewStyle>;
  /** Appearance of both fade regions; defaults to an opaque white outer edge. */
  maskStyle?: StyleProp<ViewStyle>;
  onPickStart?: (event: PickerScrollEvent) => void;
  onPickEnd?: (event: PickerScrollEvent) => void;
  style?: StyleProp<ViewStyle>;
}

export interface PickerViewColumnProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}
