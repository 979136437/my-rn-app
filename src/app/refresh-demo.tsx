import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text } from "react-native";
import {
  parseDemoParams,
  type DemoConfig,
} from "@/components/refresh-demo/config";
import { RefreshDemoScreen } from "@/components/refresh-demo/screen";

export default function RefreshDemoRoute() {
  const params = useLocalSearchParams();
  let config: DemoConfig | undefined;
  let message: string | undefined;
  try {
    config = parseDemoParams(params);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  if (config)
    return <RefreshDemoScreen key={JSON.stringify(config)} config={config} />;
  return (
    <ScrollView className="flex-1 bg-white px-4 pb-safe pt-safe dark:bg-slate-950">
      <Text
        testID="demo-parameter-error"
        selectable
        className="py-6 text-base text-red-600 dark:text-red-400"
      >
        参数错误：{message}
      </Text>
    </ScrollView>
  );
}
