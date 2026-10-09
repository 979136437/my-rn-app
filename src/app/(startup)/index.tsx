import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function Startup() {
  return (
    <View className="flex-1 items-center justify-center bg-white p-safe dark:bg-slate-950">
      <Text className="mb-6 text-xl font-semibold text-slate-900 dark:text-slate-100">
        Nitro 下拉刷新
      </Text>
      <Link href="/(tabs)" asChild>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-indigo-600 px-6 py-3"
        >
          <Text className="font-semibold text-white">进入刷新示例</Text>
        </Pressable>
      </Link>
    </View>
  );
}
