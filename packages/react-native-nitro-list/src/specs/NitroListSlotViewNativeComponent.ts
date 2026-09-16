import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  listId: string;
  slotId: string;
  bindingToken: CodegenTypes.Double;
  itemVersion: CodegenTypes.Double;
}

// Native recycling moves this subtree outside Yoga's layout. Its custom shadow
// node adds the native cell offset to descendant measurements used by Pressable.
export default codegenNativeComponent<NativeProps>('NitroListSlotView', {
  interfaceOnly: true,
}) as HostComponent<NativeProps>;
