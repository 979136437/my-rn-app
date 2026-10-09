# react-native-nitro-refresh

本 workspace 的 iOS / Android 受控下拉刷新组件。参考
[react-native-SmartRefreshLayout](https://github.com/react-native-studio/react-native-SmartRefreshLayout)
的 Android 原生容器、自定义 Header 与进度事件，以及
[react-native-MJRefresh](https://github.com/react-native-studio/react-native-MJRefresh)
的 iOS Header 状态/进度挂钩，重新实现 RN 0.86 新架构接入。

Android 使用 SmartRefreshLayout 2.1.1 内核，iOS 使用 MJRefresh 3.7.9。
Fabric 挂载视图，Nitro 控制刷新并传递业务回调；不使用旧 bridge 命令。
iOS 使用 RN 自定义刷新视图协议，无需复制或替换 ScrollView。

## 使用

iOS 静态库集成需要为 MJRefresh 开启 modular headers，使 NitroRefresh 的
Swift 目标可以使用其模块映射。本应用使用 Expo 官方 `expo-build-properties`
插件，在 `app.json` 的 `plugins` 中配置：

```json
[
  "expo-build-properties",
  {
    "ios": {
      "extraPods": [{ "name": "MJRefresh", "modular_headers": true }]
    }
  }
]
```

版本继续由 NitroRefresh.podspec 的依赖声明约束，不全局开启 modular headers。
该配置在 prebuild 时自动应用，现有 Codemagic 流程无需维护或复制 Podfile。
仅影响 iOS，Android 继续通过子包的 Gradle 配置接入。本地 macOS 可执行：

```sh
npx expo install expo-build-properties
npx expo prebuild --platform ios --no-install
cd ios && pod install
```

非 Expo 宿主可在应用 target 的 Podfile 内手动添加
`pod 'MJRefresh', :modular_headers => true`。
Windows 无法验证 CocoaPods 安装及 iOS 编译结果。

需要包含本原生包的开发构建，不支持 Expo Go。支持 RN 自带的纵向、非倒置
ScrollView、FlatList、SectionList；不支持 Web、横向滚动或上拉加载。
列表只设置 `refreshControl`，不要同时设置列表的 `onRefresh` / `refreshing`。

```tsx
import { useRef, useState } from "react";
import { FlatList } from "react-native";
import { NitroRefreshControl, type NitroRefreshControlRef } from "react-native-nitro-refresh";

const [refreshing, setRefreshing] = useState(false);
const refreshRef = useRef<NitroRefreshControlRef>(null);

async function handleRefresh() {
  setRefreshing(true); // 在 onRefresh 内同步确认请求
  try {
    await reloadData();
  } finally {
    setRefreshing(false); // 成功和失败都必须结束刷新
  }
}

<FlatList
  data={items}
  renderItem={renderItem}
  refreshControl={
    <NitroRefreshControl ref={refreshRef} refreshing={refreshing} onRefresh={handleRefresh} />
  }
/>;
refreshRef.current?.beginRefresh();
```

`refreshing` 是唯一状态来源，不提供 `finishRefresh()`。
设为 true 只展示刷新，不调用 `onRefresh`；初始 true 在原生视图就绪后生效。
手势或 `beginRefresh()` 发出一次请求，调用方应立即设为 true。
保持 false 表示拒绝请求，组件随后收起 Header。
禁用时不接受手势或主动请求，但仍允许受控 true 展示、false 结束已有刷新。
刷新和结束回弹期间重复请求不会重复通知。

刷新触发后，组件在原生层禁止列表的纵向拖动，并停止已有惯性滚动；
`pulling / ready` 仍可正常拖拽。设为 false 后保持锁定，直到 Header 回弹完成
进入 `idle` 才恢复手势滚动，拒绝请求也遵循这一过程。
行内点击、`scrollTo` / `scrollToOffset` 等程序化滚动继续可用。
组件不改写列表的 `scrollEnabled`，使用方刷新期间的更新在解锁后仍然生效。

## 接口

| 属性 | 默认值 | 含义 |
| --- | --- | --- |
| `refreshing` | 必填 | 受控刷新状态 |
| `onRefresh` | 必填 | 手势或主动刷新请求 |
| `enabled` | `true` | 启用用户请求 |
| `headerHeight` | `60` | 高度和触发距离，dp，必须为正有限数 |
| `renderHeader` | 默认 Header | `(props: RefreshHeaderProps) => ReactNode` |
| `onStateChange` | — | `idle / pulling / ready / refreshing / finishing` |
| `onPull` | — | `{ offset, progress, headerHeight, isDragging }` |
| `className` / `style` | — | 原生外层样式；Android 滚动组件会注入布局 style |

`offset` 使用 dp；`progress` 为 offset / headerHeight，可超过 1。
进度覆盖拖拽与回弹，`isDragging` 区分手指拖拽与程序/回弹移动。
两端沿用各自原生库的阻尼和回弹。

默认 Header 包含中文箭头、加载指示和深浅色样式。可导入 `DefaultRefreshHeader`，
通过 `labels`（pulling、ready、refreshing）、`className`、`textClassName`、
`indicatorColor` 定制，或用 `renderHeader` 完全替换展示内容。

```tsx
renderHeader={(props) => (
  <DefaultRefreshHeader
    {...props}
    textClassName="text-indigo-600 dark:text-indigo-300"
    labels={{ pulling: "下拉更新", ready: "松手更新", refreshing: "更新中" }}
  />
)}
```

Header 不承载交互。NativeWind content 扫描应包含 `packages/**/*.{js,jsx,ts,tsx}`。
自编动画使用 Reanimated / Worklets，默认箭头尊重减少动态效果设置，停止/卸载时取消动画。

## 开发与验收

```sh
pnpm --filter react-native-nitro-refresh nitrogen
pnpm --filter react-native-nitro-refresh codegen
pnpm exec tsc --noEmit
pnpm --filter react-native-nitro-refresh test
cd android
./gradlew :app:assembleDebug
```

生成脚本仅产生绑定。`nitrogen/generated` 由 Nitrogen 维护；`generated` 为本地
Fabric 检查产物，正式构建由 RN codegen 生成。不手工编辑生成文件。

启动页“进入刷新示例”打开默认列表、短内容、自定义 Header 三个示例。
完成/失败按钮模拟本地刷新结果，无网络和延时任务。
行内按钮显示点击次数；“滚到第5条”和“关闭/开启列表滚动”用于检查
刷新期间的程序化滚动和使用方 `scrollEnabled` 更新。

Android 开发构建打开示例后，可以运行实际设备回归检查（需要 Python、ADB）：

```sh
python packages/react-native-nitro-refresh/tests/android-scroll-lock.py --adb <adb路径> --serial <设备编号>
```

检查包含默认/自定义 Header 的双向滑动锁定、行内点击、程序化滚动、
finishing 期间的拖动、解锁、调用方滚动开关更新，以及短 ScrollView。

原生验收场景：阈值前松手、达到阈值、进度超过 1、主动刷新、重复触发、初始 true、
结束刷新、禁用、空/短列表、SectionList、多实例、刷新中切换示例/卸载、滚动事件和 ref 方法。
Node 测试验证 JS 订阅生命周期、最新回调、进度传递、多实例隔离和卸载后排队事件，
不替代设备手势验收。Windows 无法执行 iOS 编译，需在 macOS 开发构建中单独验证。

`tests/native-acceptance-screen.tsx` 可临时挂到开发路由，检查初始受控刷新、
空 SectionList、多实例、重复请求、拒绝请求、结束期间重新刷新和刷新中卸载。
挂载此测试屏幕后，上述 ADB 脚本加 `--lifecycle` 可以执行这些检查。

2026-10-09 验证记录：Nitrogen、Fabric codegen、`tsc --noEmit`、改动文件
ESLint 和 4 项 Node 测试通过。Android Debug（arm64-v8a、x86_64）编译通过，
已在 Android 真机检查上述生命周期场景，以及阈值前松手、手势刷新、禁用、
完成/失败、短 ScrollView、默认及自定义 Header 显示、列表滚动和 ref 操作。
iOS 编译、运行及对应场景仍待 macOS 验证；Android 结果不代替双端验收。

同日滚动锁定回归：Android Debug（arm64-v8a、x86_64）编译、类型检查、
改动文件 ESLint、4 项 Node 测试通过。ADB 脚本在真机通过默认/自定义 Header
的双向滑动锁定、行内点击、程序化滚动、调用方滚动开关更新、finishing 拖动及
解锁检查；手势刷新、失败后保留 `scrollEnabled=false`、短内容及上述生命周期
检查也通过。iOS 的 Pan 拦截实现与清理仍待 macOS 编译和设备验证。

## 来源与许可

两个 RN 参考仓库及本包使用 Apache-2.0，见 LICENSE 和 NOTICE。
SmartRefreshLayout 使用 Apache-2.0，MJRefresh 使用 MIT；通过 Gradle / CocoaPods 接入，
不复制其整套源码。旧版 React Native ScrollView 实现未复制。
