import { RESULTS, type DemoConfig } from "./config";

interface TaskOwner {
  started(): void;
  completed(success: boolean): void;
  rejected(): void;
}
// A cancellable local simulation; the timeout represents business work, not animation.
export function createDemoTask(
  config: Pick<DemoConfig, "result" | "refreshDurationMs">,
  owner: TaskOwner,
  schedule = setTimeout,
  cancel = clearTimeout,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  let generation = 0;
  return {
    start(controlled = false) {
      if (disposed || running) return;
      if (!controlled && config.result === RESULTS.reject) {
        owner.rejected();
        return;
      }
      running = true;
      const current = ++generation;
      owner.started();
      timer = schedule(() => {
        if (disposed || !running || generation !== current) return;
        running = false;
        timer = undefined;
        owner.completed(config.result === RESULTS.success);
      }, config.refreshDurationMs);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      generation++;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    },
  };
}
