# react-native-nitro-refresh

本 workspace 的 iOS / Android 受控下拉刷新组件。

Android 使用自定义 ViewGroup，iOS 使用 UIScrollView 与自定义 Header，
不依赖 SmartRefreshLayout、MJRefresh 或 AndroidX SwipeRefreshLayout。
Fabric 挂载视图，Nitro 控制刷新并传递业务回调；不使用旧 bridge 命令。
iOS 使用 RN 自定义刷新视图协议，无需复制或替换 ScrollView。

Android 在列表顶部接管向下拖动，使用 0.5 阻尼，最大显示距离为
max(headerHeight, triggerDistance) 的两倍；达到 triggerDistance 后松手触发刷新。iOS 使用 UIScrollView 自身
的下拉弹性，按扣除组件增量后的安全区/inset 计算相同刷新阈值。
原生容器展开与收起默认 300ms，尊重系统减少动态效果或禁用动画设置。
取消手势不触发刷新；未达阈值收起不会启动列表滚动锁。

## 使用

通过 RN 自动链接接入两端原生容器，不需要刷新引擎 Pod 或额外 Expo 配置插件。
更换原生实现后需重新生成/构建开发客户端；本地 macOS 可执行：

```sh
npx expo prebuild --platform ios --no-install
cd ios && pod install
```

Windows 无法验证 CocoaPods 安装及 iOS 编译结果。

需要包含本原生包的开发构建，不支持 Expo Go。支持 RN 自带的纵向、非倒置
ScrollView、FlatList、SectionList；不支持 Web、横向滚动或上拉加载。
列表只设置 `refreshControl`，不要同时设置列表的 `onRefresh` / `refreshing`。

```tsx
import { useRef, useState } from "react";
import { FlatList } from "react-native";
import {
  NitroRefreshControl,
  type NitroRefreshControlRef,
} from "react-native-nitro-refresh";

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
    <NitroRefreshControl
      ref={refreshRef}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    />
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

| 属性                  | 默认值      | 含义                                              |
| --------------------- | ----------- | ------------------------------------------------- |
| `refreshing`          | 必填        | 受控刷新状态                                      |
| `onRefresh`           | 必填        | 手势或主动刷新请求                                |
| `enabled`             | `true`      | 启用用户请求                                      |
| `headerHeight`        | `60`        | 刷新头高度和刷新停留距离，dp，必须为正有限数 |
| `triggerDistance` | 当前 `headerHeight` | 松手刷新阈值，dp，必须为正有限数 |
| `renderHeader`        | 默认 Header | `(props: RefreshHeaderProps) => ReactNode`        |
| `onStateChange`       | —           | `idle / pulling / ready / refreshing / finishing` |
| `onPull`              | —           | `{ offset, progress, headerHeight, triggerDistance, isDragging }`  |
| `className` / `style` | —           | 原生外层样式；Android 滚动组件会注入布局 style    |

`offset` 使用 dp；`progress` 为 offset / triggerDistance，可超过 1。
未传 `triggerDistance` 时跟随当前头高度；两者允许任意大小关系。
拖动期间 progress 达到 1 对应 ready；刷新期间停留在 headerHeight，progress 不强制为 1，
应使用 state 判断是否刷新。进度覆盖拖拽与回弹，`isDragging` 区分手指拖拽与程序/回弹移动。
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

### 参数化示例（当前实现）

启动页进入 `/refresh-tests` 测试入口列表，按组展示 57 个场景的参数和操作说明，点击后传递参数到 `/refresh-demo`；旧 `/(tabs)` 入口继续转发参数。
页面不提供刷新控制按钮；仅保留数据行点击，用于验证拖动取消点击。
所有数据和结果都是本地模拟，不访问网络。Lottie 使用现有资源，尊重减少动态效果。

`myapp://refresh-demo?container=flat-list&header=lottie&headerHeight=60&triggerDistance=90`

| 参数 | 默认值 | 可选值 / 含义 |
| --- | --- | --- |
| scenario | basic | 见下方命名场景 |
| container | flat-list | scroll-view / flat-list / section-list |
| content | long | long / short / empty |
| header | default | default / lottie |
| headerHeight | 60 | 正有限十进制数，dp |
| triggerDistance | 跟随头高度 | 正有限十进制数，dp |
| enabled | true | true / false |
| scrollEnabled | true | true / false |
| result | success | success / failure / reject |
| refreshDurationMs | 1500 | 0–2147483647 ms，固定本地模拟耗时（避免 JS 定时器溢出） |
| initialOffset | 0 | 内容布局后设置的初始滚动位置，dp，非负有限数 |

优先级：公共默认值 → 场景预设 → 显式参数。重复、空值、未知或非法参数显示错误，
不挂载原生组件。参数改变会重建实例并取消旧任务；场景内部属性更新保留实例。
失败保留数据，拒绝保持 refreshing=false，均可再次下拉。

命名场景：

- basic：正常下拉与自动结束。
- initial-refresh：初始受控刷新，onRefresh 请求数为 0。
- begin-twice：挂载后连续 beginRefresh 两次，请求数为 1。
- disable-refreshing：首次 refreshing 时禁用，当前任务正常完成。
- reopen-finishing：首次 finishing 时再次受控刷新，版本最终为 2，请求数为 1。
- update-height：首次 refreshing 时头高度翻倍，未指定阈值则同步跟随。
- update-threshold：阈值预设 90，首次拖动时翻倍，立即更新进度和就绪状态。
- unmount-refreshing：首次 refreshing 时卸载并取消任务。
- two-instances：短内容预设；A 初始受控刷新并在 refreshing 时卸载，B 独立可刷新。

### 测试

逻辑测试使用现有 Node test runner，覆盖参数解析、模拟任务结果/重试/取消和 Session 生命周期。
Node 需要支持 TypeScript stripping 与 registerHooks（本次使用 Node 24）。

`python packages/react-native-nitro-refresh/tests/android-scroll-lock.py --adb <adb路径> --serial <设备编号>`

脚本通过深链接切换场景，先预检客户端是否具有新原生绑定，再测试 18 种内容/容器/Header 组合、
阈值大小关系、反向回拉、失败/拒绝后重试、点击取消、锁定/解锁和生命周期。
用 `--suite preflight|matrix|gestures|lifecycle|parameters|disabled-requests` 单独运行。
失败证据写入 `tests/artifacts/failure.json` 和 `failure-ui.xml`（不入 Git）。
脚本只操作已安装客户端，不编译或安装应用；如原生绑定旧，需要另行授权编译及安装。
设备必须已解锁并能连接正在运行的 Metro。脚本冷启动时会先连接开发服务器；
可用 `--dev-server <URL>` 指定地址，默认 `http://127.0.0.1:8081`，本机地址自动设置 ADB reverse。
脚本本身的离线验证：`python -m unittest discover -s packages/react-native-nitro-refresh/tests -p "test_*.py"`。

`tests/native-acceptance-screen.tsx` 是复用相同页面的 props 测试宿主，默认验证双实例。
手工 iOS、系统外观及辅助功能验收见 [验收清单](tests/ACCEPTANCE.md)。
静态与逻辑测试不能替代两端原生手势验收。
本次实际执行结果见 [验证记录](tests/VERIFICATION.md)。

### 历史验证记录（不代表本次独立阈值实现通过原生测试）

2026-10-10 原生容器替换验证：类型检查、源码 ESLint、4 项 JS 生命周期测试、
Expo 配置检查与 Android Debug（arm64-v8a、x86_64）编译通过。
Android 真机（API 29）通过默认/自定义 Header 的双向滑动锁定、行内点击、
程序化滚动、调用方 scrollEnabled 更新、finishing 期间拖动及解锁；
手势刷新、完成/失败、短 ScrollView、初始 true、空 SectionList、重复触发、
结束期间重新刷新、多实例、刷新中卸载和拒绝请求均通过。
原生手势检查通过阈值前松手、行内触摸取消、ready/refreshing 状态序列、
进度超过 1、拖拽标记和结束零偏移；禁用时的手势/主动请求与系统关闭动画检查也通过。
实际 Gradle 依赖图确认无 SmartRefreshLayout。临时验收路由和示例修改已恢复。
同日修复 Android Header 越界绘制：容器显式裁剪可视区域，Debug 编译通过；
真机截图确认默认/自定义 Header 在 idle 时隐藏、刷新时展开、结束后完全收起。
同一次手势中的反向拖动、多指、系统取消及列表到顶后的手势衔接仍待手工设备验收。
iOS 的 CocoaPods 安装、编译及全部运行场景仍待 macOS 验证。
下方 2026-10-09 记录属于替换前实现。

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
参考来源保留在 NOTICE 中；当前刷新手势与回弹直接使用 Android/UIKit API，
不安装或复制两套刷新引擎。旧版 React Native ScrollView 实现未复制。
