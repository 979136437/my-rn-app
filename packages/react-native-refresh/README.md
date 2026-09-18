# react-native-refresh

Android / iOS 下拉刷新，支持 `RefreshScrollView` 和泛型 `RefreshFlatList<T>`。手势由 Gesture Handler 处理，状态和位移运行在 Reanimated UI worklet；Worklets 只负责离散回调调度。expo-haptics 提供轻量触觉反馈，不依赖 SmartRefreshLayout、MJRefresh 或其他刷新原生库。

## 接入

本仓库已通过 `workspace:*` 连接该包。依赖沿用项目当前版本：React 19.2、RN 0.86、Gesture Handler 2.32、Reanimated 4.5.1、Worklets 0.10.1、expo-haptics 57.0.3。应用最外层需要 `GestureHandlerRootView`，Expo 的 Babel preset 已配置 worklet 转换。

本子包只包含 JS/TS，不含自定义原生代码或代码生成。通过 `expo install expo-haptics` 安装与 SDK 匹配的依赖；已有开发客户端若尚未包含 expo-haptics，需要重新构建客户端。本次未执行原生构建。

```tsx
import { useRef } from 'react';
import { FlatList, Text } from 'react-native';
import { RefreshFlatList, type RefreshHandle } from 'react-native-refresh';

export function Items({ items, reload }: {
  items: { id: string; title: string }[];
  reload: () => Promise<void>;
}) {
  const refreshRef = useRef<RefreshHandle>(null);
  const listRef = useRef<FlatList<{ id: string; title: string }>>(null);
  return (
    <RefreshFlatList
      ref={listRef}
      refreshRef={refreshRef}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <Text>{item.title}</Text>}
      onRefresh={async () => {
        try {
          await reload();
        } catch (error) {
          // 在业务层显示错误或提供重试。
          console.error(error);
        } finally {
          refreshRef.current?.finishRefresh();
        }
      }}
    />
  );
}
```

ScrollView 使用相同刷新属性，将列表数据属性换成 children 即可。组件需要有界的父容器高度（通常 `flex: 1`）；不要把 FlatList 嵌入同方向 ScrollView。

## API

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `onRefresh` | 必填 | 每个刷新周期调用一次；业务在成功和失败后都调用 `finishRefresh()` |
| `refreshRef` | 无 | `beginRefresh()` / `finishRefresh()` |
| `enabled` | `true` | 禁止新的刷新；正在进行的请求仍由业务结束 |
| `headerHeight` | `64` | 头部高度，同时作为触发阈值；必须为有限正数 |
| `dragRate` | `0.5` | 手指位移到展示位移的比例；必须为有限正数 |
| `maxDragRate` | `2` | 最大展示位移 / 头高；必须有限且不小于 1 |
| `hapticsEnabled` | `true` | 每次手势首次越过阈值时反馈一次；程序触发不反馈 |
| `renderHeader` | 默认头部 | 接收 `RefreshHeaderProps`，返回 React 节点 |
| `onStateChange` | 无 | 离散状态变化后在 RN runtime 调用，不按帧调用 |
| `containerStyle` | 无 | 外层裁剪视口样式；`style` 仍作用于内部滚动组件 |

`ref` 保留底层 ScrollView / FlatList 的滚动方法。FlatList 保持 RN 原生组件，通过 `renderScrollComponent` 在内部 ScrollView 上接入刷新，不包装整个列表为 Animated 组件。普通 `onScroll`、拖动／惯性回调、`onContentSizeChange` 和 `onLayout` 沿 RN 原有调用链传递；内部独立订阅原生滚动事件。FlatList 保留调用方或 RN 默认的 `scrollEventThrottle`；独立 ScrollView 默认使用 16，保证 iOS 持续更新顶部位置，也允许调用方覆盖。禁用刷新时同时关闭 Pan 与 Native 手势识别器。

`renderHeader` 接收只读 SharedValue：`state`、`distance`（展示位移）和 `progress`（distance / headerHeight，允许大于 1）。在独立组件中使用 `useAnimatedStyle` / `useAnimatedReaction` 读取 `.get()`，不要在 React render 中读取或修改它们。动态头部需要同步调整 `headerHeight`，尤其是大字体布局。

状态为 `idle → pulling ↔ armed → refreshing → settling → idle`。松手时仍在阈值以上才刷新，取消或回拖至阈值以下则收起。原生滚动与刷新手势同时识别，普通滚动不等待刷新手势失败；进入下拉、刷新和收起状态后锁定滚动，回到 idle 后恢复调用方的 `scrollEnabled`。动画遵守系统减少动态效果设置。

`beginRefresh()` 会立即滚回顶部再展示头部；禁用时无效，刷新／收起时重复调用无效。`finishRefresh()` 仅结束当前刷新，重复调用无效。没有内置请求超时，也不自动等待 `onRefresh` 返回的 Promise。卸载取消动画并丢弃待执行的刷新回调；业务异步任务仍需自行取消。

## 首版边界

- Android 仅支持顶部起手；iOS 使用系统越界位移，支持同一手势从中部拖到顶部后继续下拉。iOS 顶部、底部和短内容回弹由系统负责，下拉过程中不平移整个列表，也不锁定滚动。
- iOS 的阻尼与最大越界距离由 UIScrollView 决定，`dragRate` / `maxDragRate` 仅作用于 Android；两端均以 `headerHeight` 作为触发阈值。iOS 未达到阈值或取消手势时使用系统回弹；触发刷新后才切换为固定头部和结束动画。
- 不包含加载更多、FlashList、横向／倒置列表、嵌套纵向滚动和旧库 API 兼容。
- 包装组件管理系统 `refreshControl` / `refreshing`、越界行为与自动 inset，不支持覆盖这些属性。
- 自动 content / keyboard inset 被关闭。通过父容器处理安全区，或显式设置 `contentInset`；顶部边界按 `-contentInset.top` 计算。不要在一次手势中改变 inset。
- Web 渲染普通滚动容器，刷新方法为空操作，不调用触觉反馈。
- 触觉反馈使用 `impactAsync(ImpactFeedbackStyle.Light)`，每次手势最多一次；反馈失败不阻断刷新，开发模式会输出警告。实际反馈受硬件与系统设置影响。

## 维护与验收

`pnpm --filter react-native-refresh typecheck` 对本包和当前应用执行 `tsc --noEmit`。根目录类型检查还会包含被 Git 忽略的旧 `example/`，其路径别名错误与本包无关。

首页提供容器切换、长／短／空列表、自定义头部、禁用、触觉开关和手动开始／结束。获得运行测试及构建授权后，在 Android 和 iOS 验收：

- 阈值前后松手、越过后回拖、系统取消及多指打断，确认不误刷新。
- 重复开始／结束、刷新中禁用、刷新中切换容器，确认恢复滚动且无卸载后回调。
- 顶部与中部起手、横向子手势、快速连续操作，确认滚动协调正确。
- 空／短列表、长列表虚拟化、显式 inset、底层 ref 和调用方事件保持有效。
- 每手势至多一次触觉反馈；关闭反馈、减少动态效果、放大字体仍可使用。

静态检查和自动链接发现不等于原生编译、真机交互或性能验证。
