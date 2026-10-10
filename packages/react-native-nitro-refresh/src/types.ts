import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { RefreshPull, RefreshState } from "./refresh-controller.nitro";

export interface RefreshHeaderProps extends RefreshPull {
  state: RefreshState;
}

export interface NitroRefreshControlRef {
  beginRefresh(): void;
}

export interface NitroRefreshControlProps {
  refreshing: boolean;
  onRefresh: () => void;
  enabled?: boolean;
  headerHeight?: number;
  /** Release threshold in dp; defaults to headerHeight. */
  triggerDistance?: number;
  renderHeader?: (props: RefreshHeaderProps) => ReactNode;
  onStateChange?: (state: RefreshState) => void;
  onPull?: (pull: RefreshPull) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Android ScrollView supplies its native scroll content through this prop. */
  children?: ReactNode;
}
