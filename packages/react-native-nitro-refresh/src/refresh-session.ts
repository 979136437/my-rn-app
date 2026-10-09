import type {
  RefreshController,
  RefreshPull,
  RefreshState,
} from "./refresh-controller.nitro.ts";

interface Callbacks {
  onRefresh: () => void;
  onStateChange: (state: RefreshState) => void;
  onPull: (pull: RefreshPull) => void;
}

/** Owns one native subscription and suppresses callbacks queued before disposal. */
export function createRefreshSession(
  controller: RefreshController,
  callbacks: Callbacks,
  refreshing: boolean,
) {
  let current = callbacks;
  let disposed = false;
  controller.configure(
    () => {
      if (!disposed) current.onRefresh();
    },
    (state) => {
      if (!disposed) current.onStateChange(state);
    },
    (pull) => {
      if (!disposed) current.onPull(pull);
    },
  );
  controller.setRefreshing(refreshing);
  return {
    update(next: Callbacks) {
      current = next;
    },
    setRefreshing(value: boolean) {
      if (!disposed) controller.setRefreshing(value);
    },
    beginRefresh() {
      if (!disposed) controller.beginRefresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.invalidate();
    },
  };
}
