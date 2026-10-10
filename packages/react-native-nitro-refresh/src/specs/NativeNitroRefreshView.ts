import { codegenNativeComponent } from "react-native";
import type { CodegenTypes, HostComponent, ViewProps } from "react-native";

export interface NativeProps extends ViewProps {
  controllerId?: CodegenTypes.WithDefault<string, "">;
  enabled?: CodegenTypes.WithDefault<boolean, true>;
  // Fabric codegen requires a literal; keep aligned with DEFAULT_HEADER_HEIGHT.
  headerHeight?: CodegenTypes.WithDefault<CodegenTypes.Float, 60>;
  triggerDistance?: CodegenTypes.WithDefault<CodegenTypes.Float, 60>;
}

export default codegenNativeComponent<NativeProps>(
  "NitroRefreshView",
) as HostComponent<NativeProps>;
