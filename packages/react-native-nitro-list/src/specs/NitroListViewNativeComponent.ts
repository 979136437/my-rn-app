import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export type NativeListScrollEvent = Readonly<{
  offsetY: CodegenTypes.Double;
  viewportWidth: CodegenTypes.Double;
  viewportHeight: CodegenTypes.Double;
  contentHeight: CodegenTypes.Double;
  state: string;
  previousState: string;
  timestamp: CodegenTypes.Double;
}>;

export type NativeViewableItemsEvent = Readonly<{
  epoch: CodegenTypes.Double;
  // Fabric's event parser requires T[] with inline object elements, not ReadonlyArray<T>.
  items: { readonly key: string; readonly version: CodegenTypes.Double }[];
}>;

export interface NativeProps extends ViewProps {
  listId: string;
  onListScroll?: CodegenTypes.DirectEventHandler<NativeListScrollEvent>;
  onListScrollStateChange?: CodegenTypes.DirectEventHandler<NativeListScrollEvent>;
  onViewableItemsChange?: CodegenTypes.DirectEventHandler<NativeViewableItemsEvent>;
  onEndReached?: CodegenTypes.DirectEventHandler<Readonly<{ dataCount: CodegenTypes.Int32; tailKey: string; epoch: CodegenTypes.Double; requestId: CodegenTypes.Double }>>;
  onRefreshRequested?: CodegenTypes.DirectEventHandler<Readonly<{ sequence: CodegenTypes.Int32 }>>;
  onRefreshStateChange?: CodegenTypes.DirectEventHandler<Readonly<{ state: string }>>;
  onPullProgress?: CodegenTypes.DirectEventHandler<Readonly<{ distance: CodegenTypes.Double; progress: CodegenTypes.Double }>>;
}

export default codegenNativeComponent<NativeProps>('NitroListView') as HostComponent<NativeProps>;
