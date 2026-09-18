import { forwardRef } from 'react';
import type { ForwardedRef, ReactElement, RefAttributes } from 'react';
import { Platform } from 'react-native';
import type { NativeListProps, NativeListRef } from './types';

type NitroListComponent = <T>(
  props: NativeListProps<T> & RefAttributes<NativeListRef>,
) => ReactElement;

let NativeImplementation: NitroListComponent | undefined;

function NitroListImpl<T>(props: NativeListProps<T>, ref: ForwardedRef<NativeListRef>) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error(`react-native-nitro-list requires Android or iOS (received ${Platform.OS}).`);
  }
  // Keep merely importing the package safe in Expo Go and on unsupported
  // platforms. Only mounting the list loads the native implementation.
  if (!NativeImplementation) {
    // Preserve the original error and stack: dependency initialization errors
    // do not necessarily mean that the application is running in Expo Go.
    NativeImplementation = require('./NitroListAndroid').default as NitroListComponent;
  }
  return <NativeImplementation {...props} ref={ref} />;
}

export const NativeList = forwardRef(NitroListImpl) as NitroListComponent;
