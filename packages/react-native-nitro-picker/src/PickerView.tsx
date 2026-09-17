import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import type { PickerViewProps } from './types';

let AndroidPicker: ComponentType<PickerViewProps> | undefined;

export function PickerView(props: PickerViewProps) {
  if (Platform.OS !== 'android') {
    throw new Error(`react-native-nitro-picker supports Android only (received ${Platform.OS}).`);
  }
  if (!AndroidPicker) AndroidPicker = require('./PickerViewAndroid').default as ComponentType<PickerViewProps>;
  return <AndroidPicker {...props} />;
}
