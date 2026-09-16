import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  listId: string;
  onRefreshRequested?: CodegenTypes.DirectEventHandler<Readonly<{ sequence: CodegenTypes.Int32 }>>;
  onRefreshStateChange?: CodegenTypes.DirectEventHandler<Readonly<{ state: string }>>;
  onPullProgress?: CodegenTypes.DirectEventHandler<Readonly<{ distance: CodegenTypes.Double; progress: CodegenTypes.Double }>>;
}

export default codegenNativeComponent<NativeProps>('NitroListView') as HostComponent<NativeProps>;
