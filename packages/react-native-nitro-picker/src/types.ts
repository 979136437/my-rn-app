import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface PickerColumnEvent {
  column: number;
}

export interface PickerChangeEvent extends PickerColumnEvent {
  value: number[];
  index: number;
}

export interface PickerViewProps {
  value: readonly number[];
  children?: ReactNode;
  itemHeight?: number;
  enabled?: boolean;
  onChange?: (event: PickerChangeEvent) => void;
  onPickStart?: (event: PickerColumnEvent) => void;
  onPickEnd?: (event: PickerColumnEvent) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  indicatorClassName?: string;
  indicatorStyle?: StyleProp<ViewStyle>;
  maskClassName?: string;
  maskStyle?: StyleProp<ViewStyle>;
  /** Opaque and transparent colors for the edge gradient. */
  maskColors?: readonly [string, string];
  testID?: string;
}

export interface PickerViewColumnProps {
  children?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Describes the selected React option to VoiceOver/TalkBack. */
  accessibilityValueText?: string;
  testID?: string;
}
