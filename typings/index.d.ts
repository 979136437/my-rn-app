import type { ViewProps } from "react-native";

declare global {
  type AnyObject = Record<string, any>;
  type BaseProps<T extends AnyObject = AnyObject> = ViewProps & T;
}

export {};
