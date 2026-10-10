import { codegenNativeComponent } from "react-native";
import type { CodegenTypes, HostComponent, ViewProps } from "react-native";

export type PickerScrollEvent = Readonly<{
  offset: CodegenTypes.Double;
  height: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  controllerId?: CodegenTypes.WithDefault<string, "">;
  enabled?: CodegenTypes.WithDefault<boolean, true>;
  // Codegen needs a literal; keep in sync with DEFAULT_ITEM_HEIGHT.
  itemHeight?: CodegenTypes.WithDefault<CodegenTypes.Float, 44>;
  onPickerScroll?: CodegenTypes.DirectEventHandler<PickerScrollEvent>;
}

export default codegenNativeComponent<NativeProps>(
  "NitroPickerColumn",
) as HostComponent<NativeProps>;
