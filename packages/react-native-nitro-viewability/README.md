# react-native-nitro-viewability

独立的 Android 组件曝光观察包。`ExposureObserver` 包装组件和 `useExposureObserver` 无包装 Hook 共用 Nitro HybridObject 观察控制器，由原生观察布局、滚动和宿主生命周期，计算可见面积并执行连续停留计时；JS 只接收状态变化，不进行逐帧测量轮询。不要求内容位于 NitroList 中。Nitro Modules 与 Nitrogen 使用项目的 **0.37.1**。

当前是 workspace 内的实现，尚未执行 Android 构建、自动测试或设备验收，不表示已经发布到 npm 或通过平台兼容认证。仅支持 Android；需要包含本包的 development build，Expo Go 不支持。新增原生包或修改原生实现后必须重新构建 Android 应用，Metro 热更新不能完成原生接入；本次未执行该构建。

## 使用

```tsx
import { Pressable, Text } from "react-native";
import { ExposureObserver, type ExposureInfo } from "react-native-nitro-viewability";

export function Promotion({ screenFocused, onOpen, reportExposure }: {
  screenFocused: boolean;
  onOpen: () => void;
  reportExposure: (info: ExposureInfo) => void;
}) {
  return (
    <ExposureObserver
      exposureKey="home-summer-promotion"
      visiblePercentThreshold={50}
      minimumViewTime={300}
      active={screenFocused}
      onExposure={reportExposure}
      style={{ padding: 16 }}
    >
      <Pressable onPress={onOpen}>
        <Text>查看活动</Text>
      </Pressable>
    </ExposureObserver>
  );
}
```

`screenFocused` 应来自应用的路由焦点状态。例如 Expo Router 可在 `useFocusEffect` 进入时置为 `true`、清理时置为 `false`。原生宿主前后台状态不能代替路由焦点：页面保持挂载但被导航切走时，业务必须通过 `active` 停止曝光。包装器参与正常布局，观察的是自身布局矩形；将需要观察的按钮、卡片或横幅作为子节点，并按普通 View 设置尺寸、padding 和布局样式。

### 无包装 Hook

```tsx
import { Pressable, Text, View } from "react-native";
import { useExposureObserver, type ExposureInfo } from "react-native-nitro-viewability";

export function ExistingButton({ screenFocused, onOpen, reportExposure }: {
  screenFocused: boolean;
  onOpen: () => void;
  reportExposure: (info: ExposureInfo) => void;
}) {
  const observerRef = useExposureObserver({
    exposureKey: "home-existing-button",
    minimumViewTime: 300,
    active: screenFocused,
    onExposure: reportExposure,
  });
  return <View ref={observerRef} collapsable={false}>
    <Pressable onPress={onOpen}><Text>查看活动</Text></Pressable>
  </View>;
}
```

把稳定的 callback ref 挂到现有原生 `View`，必须设置 `collapsable={false}`，防止 React Native 优化掉观察目标。也可挂到提供原生 View ref 的 `Pressable`；自定义组件必须把 ref 转发到实际原生 View，不接受任意复合组件实例。目标应有正常布局及非零宽高。Hook 本身不增加布局层级。包装组件内部直接使用相同 Hook，转发原生 View ref，并强制 `collapsable={false}`；无需自定义 Fabric 视图。

### 视频暂停等纯可见性监控

只使用 `onVisibilityChange`，设置 `minimumViewTime: 0`，无需提供 `onExposure`。下面的容器可以在不可见时暂停已有播放器，`player` 由业务传入，本包不依赖具体播放器：

```tsx
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { useExposureObserver } from "react-native-nitro-viewability";

export function PauseWhenHidden({ videoId, screenFocused, overlayVisible, player, children }: {
  videoId: string;
  screenFocused: boolean;
  overlayVisible: boolean;
  player: { pause(): void };
  children: ReactNode;
}) {
  const observerRef = useExposureObserver({
    exposureKey: `video-${videoId}`,
    minimumViewTime: 0,
    visiblePercentThreshold: 50,
    active: screenFocused && !overlayVisible,
    onVisibilityChange: ({ isViewable }) => {
      if (!isViewable) player.pause();
    },
  });
  // 卸载不保证发送退出事件，播放器也可能由组件外部持有。
  useEffect(() => () => player.pause(), [player]);
  return <View ref={observerRef} collapsable={false}>{children}</View>;
}
```

`children` 放入已有的视频视图，并正常设置其尺寸。阈值 `50` 表示不足一半可见就暂停；设为 `0` 表示完全滚出可视范围才暂停。首次会话的 `false` 也会调用暂停，因此这个示例由业务显式决定何时播放；播放器实例应保持稳定。恢复可见不自动播放，避免覆盖用户手动暂停的意愿。

| 场景 | 处理方式 |
| --- | --- |
| 滚出可视范围或被祖先裁剪至低于阈值 | 原生通知 `isViewable=false` |
| 跳转页面但视频页保留挂载 | 调用方把路由焦点传给 `active` |
| App 进入后台、宿主暂停 | 原生通知不可见并清空计时 |
| 下拉通知栏、系统窗口等导致当前窗口失焦 | 窗口焦点监听通知不可见，不依赖 Activity 暂停 |
| 观察器首次挂载时窗口已经失焦 | 保持不可见，获焦后重新判断 |
| 窗口重新获焦 | 还需宿主已恢复、`active/enabled` 为 true、面积达标；从零重新计时 |
| 页面内的业务遮罩没有引起窗口失焦 | 调用方设置 `active={false}` |
| 卸载视频组件 | 调用方清理播放器或主动暂停，不依赖退出回调 |

这里的“焦点”是 Android 窗口焦点，不是输入框或某个 View 的输入焦点。通知栏覆盖检测依赖系统发出的窗口失焦或宿主暂停事件，不做通知栏像素检测；厂商系统若覆盖窗口却没有触发这两类事件，无法仅凭该观察器识别。回调通过 JS 异步交付，JS 阻塞时播放器暂停也可能延后；本包没有直接控制原生播放器。

## API

`ExposureObserverProps` 继承 `ViewProps`，另提供以下配置；`useExposureObserver(options)` 使用相同曝光配置及回调，不接收 View 布局属性：

| 属性 | 说明 | 默认值 |
| --- | --- | --- |
| `exposureKey: string` | 必填，当前观察对象的稳定业务身份 | 必填 |
| `visiblePercentThreshold` | 可见面积占完整面积的百分比阈值，有限数值 `0..100` | `50` |
| `minimumViewTime` | 达到面积阈值的连续停留时间，有限非负毫秒数 | `0` |
| `enabled` | 是否启用观察 | `true` |
| `active` | 当前业务场景是否活跃，用于路由焦点等控制 | `true` |
| `onExposure(info)` | 每次符合曝光条件时通知，仅发送 `isViewable: true` | 未设置 |
| `onVisibilityChange(info)` | 初始未曝光状态，以及符合 / 离开曝光条件时通知 | 未设置 |

```ts
type ExposureInfo = {
  key: string;
  isViewable: boolean;
  visiblePercent: number;
  timestamp: number;
};
```

`visiblePercent` 是事件发生时可见面积百分比，并非持续逐帧更新的数据流。`isViewable` 同时考虑面积阈值和连续停留时间。零面积或完全不可见的组件不会因阈值为 `0` 而曝光。`timestamp` 使用原生 uptime 毫秒值，不能作为日期，也不能直接与 `Date.now()` 相减。回调异步进入 JS，不是 UI 线程 worklet。

离开可见条件后再次进入，需要重新满足连续停留时间，并再次触发 `onExposure`。组件不做全局“每个 key 只上报一次”去重；会话级或业务级只上报一次策略由调用方维护。更换业务对象时更新 `exposureKey`，不要复用旧身份代表新内容。

每个新会话先报告未曝光状态。key、目标 View 或判定参数变化时重启会话；仅更换回调引用不重置计时。关闭 `enabled`、设置 `active={false}`、宿主进入后台或窗口失焦时清空计时，恢复后重新判断。窗口失焦会取消停留到期任务，已曝光目标通知一次退出；已经不可见的目标不重复通知。同 key 的不同实例拥有独立会话，不共享计时。卸载会清理观察，不保证向已经卸载的组件发送退出通知。

## 可见性边界与复用

原生检测窗口边界、祖先裁剪、平移、缩放、隐藏状态、零透明度、脱离窗口以及宿主暂停，避免仅凭组件已经挂载就判断曝光。旋转和倾斜按包围矩形近似，不分析圆角、任意形状、同级浮层、弹窗或其他覆盖物的真实像素遮挡。页面被业务浮层覆盖时可额外设置 `active={false}`。Android 布局和裁剪结果不等同于用户实际注视或看见内容。

本包内部的 Kotlin tracker 负责稳定身份、可见条件、连续计时和变化集合；具体宿主提供几何信息与生命周期。`ExposureObserver` 使用面积比例，NitroList 的原生适配器复用该核心但仍使用项目垂直可见高度比例，保留原有 `viewabilityConfig` 和 `onViewableItemsChanged` API。这是内部原生复用接口，不是需要业务直接调用的 JS tracker API。

普通按钮、广告卡片等独立组件可以选择包装器或 Hook。NitroList 数据项应优先使用列表自带的可见项目回调，它了解槽位复用、业务索引、测量版本与隐藏内容；不建议为每个列表 cell 额外套一层 observer。演示使用包装广告卡片和 Hook 观察头部展开按钮，在独立状态面板分别记录曝光次数，避免曝光回调触发列表父组件反复重新渲染。工具栏可暂停 / 恢复普通组件曝光，并与路由焦点共同控制 `active`。滚出头部后回顶部，停留达到阈值会再次计数；NitroList 的可见项回调仍独立展示。

本包由未发布的 workspace 原型迁移而来，不提供旧名称兼容别名。原生注册、JNI/CMake 与 autolinking 通过 Nitro 接入；生成绑定由 Nitrogen 维护，不手工编辑。观察控制器管理目标、配置及断开连接，原生目标通过 UIManager 解析；无法解析时有限重试并报错，不会静默作为不可见处理。

## 待验收

- 展开 / 收起通知栏、打开导致窗口失焦的系统窗口：已曝光时退出一次，停留计时中断后重新计时；窗口失焦期间首次挂载、重新挂载都不能曝光。
- 视频使用 `minimumViewTime: 0`，覆盖滚出范围、路由失活、前后台、窗口失焦及卸载暂停；恢复时保留用户手动暂停状态。
- 焦点恢复但 `active=false`、`enabled=false` 或宿主未恢复时不能进入；失焦 / 获焦与 detach / reattach、目标替换交错时不交付旧会话事件。
- 独立按钮和卡片在窗口内、滚动容器内及祖先裁剪时，检查面积 `0 / 50 / 100%` 阈值、初始 false、进入和退出事件。
- 快速经过不足连续时间不曝光；离开后重入重新计时，多次有效进入可以多次曝光。
- 切换 `enabled`、`active`、业务 key，隐藏祖先、切到后台、恢复前台和卸载，确认不保留旧计时或报告旧业务身份。
- 普通内容尺寸变化、点击交互和列表头部滚出再进入，检查正常布局、触摸范围及曝光计数；列表项目回调仍保持原有高度比例语义。
- Hook 和包装器结果一致；横纵滚动与嵌套裁剪、目标 ref 替换、同 key 多实例、卸载及重新挂载均需要设备验收。

以上需在重新构建后的 Android 开发应用中验收，本次未运行。未经授权不运行项目构建，不额外引入测试框架。
