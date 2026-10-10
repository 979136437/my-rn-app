import { cn } from "cn";
import { cssInterop } from "nativewind";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Platform, View } from "react-native";
import { NitroModules } from "react-native-nitro-modules";
import { DefaultRefreshHeader } from "./default-refresh-header";
import {
  DEFAULT_HEADER_HEIGHT,
  HEADER_HEIGHT_LOWER_BOUND,
  SUPPORTED_REFRESH_PLATFORMS,
} from "./defaults";
import type { RefreshController } from "./refresh-controller.nitro";
import { createRefreshSession } from "./refresh-session";
import NativeRefreshView from "./specs/NativeNitroRefreshView";
import type {
  NitroRefreshControlProps,
  NitroRefreshControlRef,
  RefreshHeaderProps,
} from "./types";

cssInterop(NativeRefreshView, { className: "style" });

export const NitroRefreshControl = forwardRef<
  NitroRefreshControlRef,
  NitroRefreshControlProps
>(function NitroRefreshControl(
  {
    refreshing,
    onRefresh,
    enabled = true,
    headerHeight = DEFAULT_HEADER_HEIGHT,
    triggerDistance = headerHeight,
    renderHeader,
    onStateChange,
    onPull,
    className,
    style,
    children,
  },
  ref,
) {
  if (!SUPPORTED_REFRESH_PLATFORMS.has(Platform.OS)) {
    throw new Error("NitroRefreshControl supports iOS and Android only.");
  }
  if (
    !Number.isFinite(headerHeight) ||
    headerHeight <= HEADER_HEIGHT_LOWER_BOUND
  ) {
    throw new Error("headerHeight must be a positive finite number.");
  }
  if (
    !Number.isFinite(triggerDistance) ||
    triggerDistance <= HEADER_HEIGHT_LOWER_BOUND
  ) {
    throw new Error("triggerDistance must be a positive finite number.");
  }
  const session = useRef<ReturnType<typeof createRefreshSession> | null>(null);
  const [controllerId, setControllerId] = useState("");
  const [refreshRequests, setRefreshRequests] = useState(0);
  const [header, setHeader] = useState<RefreshHeaderProps>({
    state: "idle",
    offset: 0,
    progress: 0,
    headerHeight,
    triggerDistance,
    isDragging: false,
  });
  const callbacks = {
    onRefresh() {
      try {
        onRefresh();
      } finally {
        // Reconcile even when the owner declines the request and keeps false.
        setRefreshRequests((count) => count + 1);
      }
    },
    onStateChange(state: RefreshHeaderProps["state"]) {
      setHeader((previous) => ({ ...previous, state }));
      onStateChange?.(state);
    },
    onPull(pull: Omit<RefreshHeaderProps, "state">) {
      setHeader((previous) => ({ ...previous, ...pull }));
      onPull?.(pull);
    },
  };
  const latest = useRef({ callbacks, refreshing });
  useLayoutEffect(() => {
    latest.current = { callbacks, refreshing };
    session.current?.update(callbacks);
  });
  useEffect(() => {
    const controller =
      NitroModules.createHybridObject<RefreshController>("RefreshController");
    const subscription = createRefreshSession(
      controller,
      latest.current.callbacks,
      latest.current.refreshing,
    );
    session.current = subscription;
    setControllerId(controller.instanceId);
    return () => {
      session.current = null;
      subscription.dispose();
    };
  }, []);
  useEffect(() => {
    session.current?.setRefreshing(refreshing);
  }, [refreshing, refreshRequests]);
  useImperativeHandle(
    ref,
    () => ({
      beginRefresh() {
        session.current?.beginRefresh();
      },
    }),
    [],
  );

  return (
    <NativeRefreshView
      controllerId={controllerId}
      enabled={enabled}
      headerHeight={headerHeight}
      triggerDistance={triggerDistance}
      className={cn(
        Platform.OS === "android" ? "" : "absolute left-0 top-0 w-full",
        className,
      )}
      style={style}
    >
      <View
        collapsable={false}
        pointerEvents="none"
        className="w-full"
        style={{ height: headerHeight }}
      >
        {renderHeader ? (
          renderHeader({ ...header, headerHeight, triggerDistance })
        ) : (
          <DefaultRefreshHeader
            {...header}
            headerHeight={headerHeight}
            triggerDistance={triggerDistance}
          />
        )}
      </View>
      {Platform.OS === "android" ? children : null}
    </NativeRefreshView>
  );
});
