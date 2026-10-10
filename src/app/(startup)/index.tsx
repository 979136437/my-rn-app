import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function Startup() {
  return (
    <View className="flex-1 items-center justify-center bg-white p-safe dark:bg-slate-950">
      <Text className="mb-6 text-xl font-semibold text-slate-900 dark:text-slate-100">
        Nitro 原生组件测试
      </Text>
      <Link href="/refresh-tests" asChild>
        <Pressable
          testID="refresh-demo-entry"
          accessibilityRole="button"
          className="rounded-xl bg-indigo-600 px-6 py-3"
        >
          <Text className="font-semibold text-white">下拉刷新测试</Text>
        </Pressable>
      </Link>
      <Link href="/picker-tests" asChild>
        <Pressable
          testID="picker-tests-entry"
          accessibilityRole="button"
          className="mt-3 rounded-xl bg-indigo-600 px-6 py-3"
        >
          <Text className="font-semibold text-white">立体选择器测试</Text>
        </Pressable>
      </Link>
    </View>
  );
}
