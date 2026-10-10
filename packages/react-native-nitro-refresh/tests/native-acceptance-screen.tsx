import {
  DEMO_DEFAULTS,
  SCENARIOS,
  type DemoConfig,
} from "../../../src/components/refresh-demo/config";
import { RefreshDemoScreen } from "../../../src/components/refresh-demo/screen";

/** Parameter-driven host: no refresh controls or lifecycle buttons. */
export default function NativeAcceptanceScreen({
  config = { ...DEMO_DEFAULTS, scenario: SCENARIOS.isolation },
}: {
  config?: DemoConfig;
}) {
  return <RefreshDemoScreen key={JSON.stringify(config)} config={config} />;
}
