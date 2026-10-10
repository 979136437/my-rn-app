import { Link } from "expo-router";
import { Pressable, SectionList, Text, View } from "react-native";
import {
  REFRESH_TEST_SECTIONS,
  testCaseHref,
} from "@/components/refresh-demo/test-cases";

export default function RefreshTestsRoute() {
  return (
    <View className="flex-1 bg-white pb-safe pt-safe dark:bg-slate-950">
      <SectionList
        testID="refresh-tests-list"
        sections={REFRESH_TEST_SECTIONS}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View className="gap-2 px-4 py-5">
            <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              下拉刷新测试
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300">
              点击条目进入对应参数场景。全部数据与请求为本地模拟，执行结果需观察诊断并按说明验收。
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text className="bg-slate-100 px-4 py-3 text-base font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <Link href={testCaseHref(item.params)} asChild>
            <Pressable
              testID={`refresh-test-${item.id}`}
              accessibilityRole="link"
              accessibilityLabel={`${item.title}。${item.instruction}`}
              className="gap-2 border-b border-slate-100 px-4 py-4 active:bg-slate-100 dark:border-slate-800 dark:active:bg-slate-900"
            >
              <Text className="text-base font-medium text-slate-900 dark:text-slate-100">
                {item.title} ›
              </Text>
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {item.instruction}
              </Text>
              <Text
                selectable
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                {testCaseHref(item.params)}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}
