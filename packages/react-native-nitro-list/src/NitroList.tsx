import { forwardRef } from 'react';
import type { ForwardedRef, ReactElement, RefAttributes } from 'react';
import { Platform } from 'react-native';
import type { NitroListProps, NitroListRef } from './types';

type NitroListComponent = <T>(
  props: NitroListProps<T> & RefAttributes<NitroListRef>,
) => ReactElement;

let AndroidList: NitroListComponent | undefined;

function NitroListImpl<T>(props: NitroListProps<T>, ref: ForwardedRef<NitroListRef>) {
  if (Platform.OS !== 'android') {
    throw new Error(`react-native-nitro-list currently supports Android only (received ${Platform.OS}).`);
  }
  // Keep merely importing the package safe in Expo Go and on unsupported
  // platforms. Only mounting the Android list loads the native implementation.
  if (!AndroidList) {
    // Preserve the original error and stack: dependency initialization errors
    // do not necessarily mean that the application is running in Expo Go.
    AndroidList = require('./NitroListAndroid').default as NitroListComponent;
  }
  return <AndroidList {...props} ref={ref} />;
}

export const NitroList = forwardRef(NitroListImpl) as NitroListComponent;
