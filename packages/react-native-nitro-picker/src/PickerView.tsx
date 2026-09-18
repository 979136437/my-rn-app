import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import type { PickerViewProps } from './types';

let NativePicker: ComponentType<PickerViewProps> | undefined;

export function PickerView(props: PickerViewProps) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error(`react-native-nitro-picker supports Android and iOS only (received ${Platform.OS}).`);
  }
  if (!NativePicker) NativePicker = require('./PickerViewAndroid').default as ComponentType<PickerViewProps>;
  return <NativePicker {...props} />;
}
