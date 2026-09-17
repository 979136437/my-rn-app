# react-native-nitro-list

Android 原生列表原型：`RecyclerView` 负责滚动、布局和 cell 回收，Fabric 承载 React 内容，Nitro HybridObject 提供列表控制接口。支持纵向列表、动态高度瀑布流、同类型 React 子树复用、React 自定义下拉刷新头、触底加载、列表头尾、空状态与内容内边距。

当前接入环境为 Expo 57、React Native 0.86.3、新架构、React 19.2.3 和 Reanimated 4.5.1。`react-native-nitro-modules` 与 Nitrogen 固定为 **0.37.1**。这些是原型的接入版本，不表示已完成兼容性认证。

**本次实现未执行原生编译、自动测试或设备验收，不能据此认定挂载、手势、性能和滚动稳定性已经通过验证。** iOS 和 Web 暂未实现；横向列表、嵌套列表、跨列卡片及二楼交互不在首版范围内。

## 接入

根项目通过 workspace 依赖引用此包。使用方需要安装上述 peer dependencies，并使用包含此原生包的 **Android development build**；Expo Go 无法加载自定义原生代码。变更 Kotlin、C++ 或原生组件配置后需要重新生成开发构建，Metro 热更新不能替代该步骤。

Nitrogen 生成文件放在 `nitrogen/generated`。改动 `.nitro.ts` 接口后执行 `pnpm --filter react-native-nitro-list codegen:nitro`，不要手工修改生成文件。React Native Fabric 的 codegen 在原生工程接入流程中运行。

槽位使用手写 Fabric ShadowNode，通过原生 State 同步 RecyclerView 中的实际位置，让 React `measure()` 和 `Pressable` 的点击范围与显示位置一致。相关 C++ 源码位于 `android/src/main/jni`；槽位的 `interfaceOnly` 配置保留 codegen 生成的属性与平台接口，ShadowNode 和组件描述符由包提供，不修改生成代码。

在当前 workspace 中修改子包的 `react-native.config.js` 后，Gradle 默认的自动链接缓存不会因该文件变化而失效。若编译提示找不到 `NitroListSlotViewComponentDescriptor`，检查 `android/build/generated/autolinking/autolinking.json` 中本包的 `cmakeListsPath`，应指向 `android/src/main/jni/CMakeLists.txt`。若仍指向 `android/build/generated/source/codegen/jni/CMakeLists.txt`，删除这份缓存 JSON，再重新构建开发版，由 Gradle 重新生成自动链接配置；不要手工修改生成的头文件或 `autolinking.cpp`。

需要 Android SDK、JDK 和 Android 设备或模拟器。以下是**由使用者明确决定后执行**的开发构建命令；本次工作没有执行：

```sh
pnpm exec expo run:android
```

包通过 React Native autolinking 接入 Android。不要直接复制 cell View 到其他原生父节点，也不要在 Expo Go 中尝试挂载组件。根应用对不支持的平台和 Expo Go 显示说明页。

## 基本用法

```tsx
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  NitroList,
  useRecyclingState,
  type NitroListRef,
  type NitroListProps,
} from "react-native-nitro-list";

type Item = { id: string; title: string; kind: "note" | "photo" };
type HeaderInfo = Parameters<NonNullable<NitroListProps<Item>["renderRefreshHeader"]>>[0];

function RefreshHeader({ state, progress }: HeaderInfo) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${Math.min(progress.value, 1) * 180}deg` }],
  }));
  return (
    <View style={{ height: 64, alignItems: "center", justifyContent: "center" }}>
      <Animated.Text style={style}>↓</Animated.Text>
      <Text>{state === "refreshing" ? "刷新中…" : "下拉刷新"}</Text>
    </View>
  );
}

function Card({ item }: { item: Item }) {
  const [expanded, setExpanded] = useRecyclingState(false);
  return (
    <Pressable onPress={() => setExpanded(value => !value)}>
      <Text>{item.title}</Text>
      {expanded && <Text>展开后会重新测量高度。</Text>}
    </Pressable>
  );
}

export function Feed({ initialItems, loadItems }: {
  initialItems: Item[];
  loadItems: () => Promise<Item[]>;
}) {
  const ref = useRef<NitroListRef>(null);
  const [data, setData] = useState(initialItems);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      setData(await loadItems());
    } catch {
      setError("刷新失败，请重试");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {error && <Text>{error}</Text>}
      <NitroList
        ref={ref}
        style={{ flex: 1 }}
        data={data}
        keyExtractor={item => item.id}
        getItemType={item => item.kind}
        renderItem={({ item }) => <Card item={item} />}
        layout="masonry"
        numColumns={2}
        gap={12}
        estimatedItemSize={240}
        refreshing={refreshing}
        onRefresh={refresh}
        renderRefreshHeader={info => <RefreshHeader {...info} />}
      />
    </View>
  );
}
```

组件需要有确定的可用高度，例如位于 `flex: 1` 的父容器内并设置 `style={{ flex: 1 }}`。不要把它嵌入同方向的 `ScrollView`。需要外边距时设置列表容器的 `margin`，`gap` 只负责项目间距。

## API

| 属性 | 说明 | 默认值 |
| --- | --- | --- |
| `data: readonly T[]` | 业务数据留在 JS | 必填 |
| `renderItem({ item, index, itemKey })` | 返回 React 内容；Hooks 放在返回的组件中 | 必填 |
| `keyExtractor(item, index): string` | 全列表唯一、插入删除后仍稳定的 key | 必填 |
| `getItemType(item, index): string \| number` | 同类型内容使用相同复用池 | 单一类型 |
| `extraData` | 触发依赖列表外部状态的内容更新 | 未设置 |
| `layout` | `"list"` 或 `"masonry"` | `"list"` |
| `numColumns` | 瀑布流列数；普通列表为单列 | 瀑布流 2 |
| `gap` | 行列间距，dp | `0` |
| `estimatedItemSize` | 初次测量之前的估算高度，dp | `160` |
| `style` | 原生列表容器样式 | `flex: 1`、`overflow: "hidden"` |
| `contentContainerStyle` | 仅支持数值型 `padding`、`paddingHorizontal`、`paddingVertical`、`paddingTop`、`paddingRight`、`paddingBottom`、`paddingLeft` | 各边 `0` |
| `ListHeaderComponent` | 列表头部，接受 React 元素或无必填参数的组件类型 | 未设置 |
| `ListFooterComponent` | 列表尾部，接受 React 元素或无必填参数的组件类型 | 未设置 |
| `ListEmptyComponent` | 数据为空时的内容，接受 React 元素或无必填参数的组件类型 | 未设置 |
| `onEndReached()` | 非空列表进入末端阈值时通知业务加载 | 未设置 |
| `onEndReachedThreshold` | 距末端阈值，单位为扣除垂直内容内边距后的可用视口高度 | `0.5` |
| `loadingMore` | 受控分页加载状态；加载中不触发触底通知 | `false` |
| `hasMore` | 是否仍有下一页 | `true` |
| `onScroll(info)` | 异步 JS 滚动位置通知，参数为 `NitroListScrollInfo` | 未设置 |
| `scrollEventThrottle` | `onScroll` 最小通知间隔，有限非负毫秒数；`0` 表示最多每帧一次 | `16` |
| `onScrollStateChange(info)` | 原生滚动状态变化通知，不受滚动节流限制 | 未设置 |
| `onScrollBeginDrag(info)` / `onScrollEndDrag(info)` | 进入 / 离开 `dragging` 状态时通知 | 未设置 |
| `onMomentumScrollBegin(info)` / `onMomentumScrollEnd(info)` | 进入 / 离开 `settling` 状态时通知，包括程序动画滚动 | 未设置 |
| `viewabilityConfig` | 可见比例、连续停留时间、是否等待交互，详见下文 | `50%` / `0 ms` / `false` |
| `onViewableItemsChanged({ viewableItems, changed })` | 业务数据项可见集合或其内容改变时通知 | 未设置 |
| `refreshing` | 受控刷新状态 | `false` |
| `onRefresh()` | 达到阈值并松手后触发 | 未设置 |
| `renderRefreshHeader(info)` | 自定义 React 刷新头 | 启用刷新时使用内置指示器和文案 |
| `refreshHeaderHeight` | 刷新期间的头部停留高度，dp | `64` |
| `refreshThreshold` | 松手触发阈值，dp | `64` |
| `onDiagnostics(info)` | 原型调试数据，详见下文 | 未设置 |

`NitroListRef` 提供 `scrollToOffset({ offset, animated? })` 和 `scrollToEnd({ animated? })`；offset 使用 dp。普通动态高度列表和瀑布流的远距离 `scrollToOffset` 都使用已缓存或估算的项目高度定位；尚未测量的位置只能近似到达，首版不提供精确的 `scrollToIndex`。

新的滚动指令会停止之前的动画或惯性滚动。`scrollToEnd` 在尾部 React 内容完成当前版本的测量和布局后补齐底部位置；期间用户触摸、数据变更、新的滚动指令或页面脱离窗口会取消旧请求的补齐。调用完成之后发生的异步内容增高不提供持续吸底。

刷新头参数包含 `state`、`pullDistance: SharedValue<number>` 和 `progress: SharedValue<number>`。`state` 为 `idle / pulling / ready / refreshing / settling`；`pullDistance` 为实际下拉距离，使用 dp，`progress` 为相对阈值的进度，截断在 `[0, 1]`。连续进度由 Fabric 事件与 Reanimated worklet 在 UI 线程更新，状态转换才进入 React。

`onRefresh` 必须及时设置 `refreshing=true`，并在异步操作结束的 `finally` 中设置为 `false`。原生在等待受控状态确认时有约 1 秒超时；业务未确认时回弹，避免刷新头永久停留。业务也可以直接控制 `refreshing` 发起刷新。没有 `onRefresh` 时不触发手势刷新。

下拉过程中外部开启 `refreshing` 时，当前手势不再改变刷新状态，也不会在松手时重复请求刷新；手势结束后保持受控刷新头。

## 分页、头尾与内容内边距

内容顺序为头部、数据（为空时显示空状态）、尾部。辅助区域在瀑布流中占满内容宽度，空状态按自身内容自然高度展示，不自动填满视口。辅助区域不会调用业务 `keyExtractor`、`getItemType` 或 `renderItem`，业务索引仍从 `0` 开始。辅助区域自身不添加 `gap`，需要留白时在头尾或空状态自身设置 padding；数据卡片保留现有列间距和底部 `gap`，包括尾部之前最后一张卡片的底部间距。

`contentContainerStyle` 的具体边优先于轴向 padding，轴向 padding 优先于总 padding；省略的值为零。仅支持以上非负、有限数值型 padding 属性，不支持百分比、背景、对齐或任意 `ViewStyle` 属性；不支持的属性会报错。内容宽度先扣除左右内边距，再划分瀑布流列宽；头尾与空状态使用完整内容宽度。`scrollToOffset({ offset: 0 })` 展示包含顶部内边距的内容顶部，`scrollToEnd()` 包含尾部与底部内边距。

```tsx
<NitroList
  data={items}
  keyExtractor={item => item.id}
  renderItem={({ item }) => <Card item={item} />}
  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
  ListHeaderComponent={<Text style={{ paddingBottom: 16 }}>最新内容</Text>}
  ListEmptyComponent={<Text>暂无内容，请刷新或主动加载第一批</Text>}
  ListFooterComponent={
    <View style={{ paddingTop: 16 }}>
      <Text>{loadingMore ? "加载中…" : error ? "加载失败" : hasMore ? "继续向下浏览" : "没有更多了"}</Text>
      {error && <Pressable onPress={retryPage}><Text>重试</Text></Pressable>}
    </View>
  }
  onEndReached={loadNextPage}
  onEndReachedThreshold={0.5}
  loadingMore={loadingMore}
  hasMore={hasMore}
/>
```

以上分页状态和回调由业务提供。`loadNextPage` 应同步设置加载状态，并用请求锁防止重复请求；成功后以新数组追加数据，更新 `hasMore`，结束时清除 `loadingMore`。失败后保留错误状态，重试按钮直接调用业务重试逻辑。列表不内置网络请求、错误提示或重试策略。刷新、切换查询和卸载时取消旧请求或通过请求版本丢弃旧结果，避免旧分页追加到新数据中。

触底通知要求存在数据及回调、`hasMore=true`，且未刷新、未分页加载；首次非空短列表也会检查并自动补页。空列表不触发，因此第一批数据必须由业务主动加载。同一批数据停留在阈值内只通知一次；成功追加后会再次检查，必要时继续补页。仅切换 `loadingMore`、更新头尾或重新测量不会重置记录，失败或返回空页不自动重试；滚出阈值后再次进入可重新通知。业务如要求错误后只能手动重试，应在 `loadNextPage` 中检查错误状态。返回空页且已结束时应设置 `hasMore=false`。

末端距离包含尾部和底部内边距。末端尚未挂载时，按缓存尺寸及 `estimatedItemSize` 估算剩余距离；末端挂载并测量后使用实际布局，瀑布流取最深列。因此动态高度列表的触发位置可能随测量修正，阈值不是精确像素承诺。刷新开始会重置触发记录，刷新结束后可重新检查短列表；原生事件携带内部代际标识，丢弃数据替换或刷新前排队的旧通知。

## 滚动事件与可见项目

所有滚动回调使用相同的 `NitroListScrollInfo`：

```ts
type NitroListScrollInfo = {
  contentOffset: { x: number; y: number };
  contentSize: { width: number; height: number };
  layoutMeasurement: { width: number; height: number };
  state: "idle" | "dragging" | "settling";
  timestamp: number;
};
```

尺寸和偏移使用 dp，`timestamp` 是原生单调时钟的毫秒值，不能当作日期或直接与 `Date.now()` 相减。动态高度项目尚未测量时，内容高度和偏移包含估算值；测量或布局变化后可能修正，不宜据此计算精确曝光位置或远距离项目坐标。

`dragging` 表示原生列表拖动，`settling` 包括松手后的惯性滚动以及 `scrollToOffset` / `scrollToEnd` 发起的动画滚动，`idle` 表示静止。因此 `onMomentumScrollBegin` 不保证由用户手势发起。拖动结束后可能直接进入 `idle`，不一定发生惯性滚动。状态变化通知及对应的拖动、惯性边界回调不受 `scrollEventThrottle` 限制；这些回调都异步进入 JS，不是 UI 线程 worklet 接口。

刷新头的下拉与回弹沿用独立的刷新进度接口，不改变列表内容偏移，也不单独产生列表拖动阶段回调。`waitForInteraction` 接受用户拖动列表或下拉刷新，程序调用滚动不解除该门槛。

`viewabilityConfig` 支持以下三个可选字段：

| 字段 | 规则 | 默认值 |
| --- | --- | --- |
| `itemVisiblePercentThreshold` | 有限数值 `0..100`；项目垂直可见高度占自身高度的百分比阈值 | `50` |
| `minimumViewTime` | 有限非负毫秒数；满足比例条件的连续时间 | `0` |
| `waitForInteraction` | 首次用户滚动交互之前暂不报告可见项目 | `false` |

项目必须与可用视口存在正高度重叠；阈值为 `0` 也不把零重叠项目算作可见。完全可见的项目符合比例条件。连续停留计时在离开条件或项目内容版本改变时重置；头部、尾部、空状态以及虽挂载但被隐藏的过期槽位内容均不计入。

可见性按列表内的实际几何范围计算，包含内容内边距及刷新下拉后的裁剪，不检测其他浮层对卡片的遮挡。列表隐藏、窗口不可见或脱离窗口时会清空计时与可见集合；重新显示后重新计算连续停留时间。卸载后的回调不会送给已卸载的 React 组件。

回调中的 `viewableItems` 是当前符合条件的业务项目，`changed` 是本次变化；每个 token 含 `{ item, key, index, isViewable }`，`index` 始终是原始业务数据索引。项目离开或删除时以最后已知的 `item`、`index` 报告 `isViewable: false`；新项目满足条件或可见项目的索引、内容改变时报告 `true`。该回调不会随每次滚动重复发送相同集合；首次可以收到空集合快照。它用于业务曝光或可见状态追踪，不代表所有挂载槽位。

```tsx
// 保持配置、回调引用稳定。不要在滚动回调里替换业务数据数组。
const viewabilityConfig = { itemVisiblePercentThreshold: 50, minimumViewTime: 300 };

<NitroList
  data={items}
  keyExtractor={item => item.id}
  renderItem={({ item }) => <Card item={item} />}
  scrollEventThrottle={120}
  onScroll={handleScroll}
  onScrollStateChange={handleScrollStateChange}
  viewabilityConfig={viewabilityConfig}
  onViewableItemsChanged={handleViewableItemsChanged}
/>
```

演示页将滚动状态、取整后的 y 偏移和可见 key 数量显示在独立状态面板，以 `120 ms` 采样滚动、`50% / 300 ms` 判断可见性。面板更新不触发列表所属组件重新渲染，避免滚动读数反复改变头尾元素身份和测量版本。业务在父组件存储滚动状态时，也应稳定头尾元素与列表数据引用。

### 普通组件曝光

独立的 workspace 包 `react-native-nitro-viewability` 提供 `ExposureObserver` 包装组件和 `useExposureObserver` 无包装 Hook，可观察按钮、广告卡片等普通组件；两个入口共用 Nitro 原生观察控制器。NitroList 的 Android 可见性适配器复用它的 Kotlin tracker 核心，列表公开 API、业务索引、槽位版本过滤及垂直高度比例语义保持不变。独立观察使用**可见面积比例**，不要将两个接口的百分比含义混用。列表数据项优先使用 `onViewableItemsChanged`，无需为每个 cell 添加包装器。

演示在列表头部使用包装广告卡片和 Hook 观察现有展开按钮，设置稳定 key、`50%` 面积和 `300 ms` 连续停留时间，并用路由焦点与工具栏暂停开关共同控制 `active`。Hook ref 必须连接实际原生 View，且目标需要 `collapsable={false}`。独立面板分别显示曝光次数，回调不会让列表父组件反复重渲染。滚出再进入且满足停留时间会再次计数，不做全局一次性去重。两个入口没有 JS 逐帧轮询，不承诺识别同级浮层遮挡或复杂变换；详细用法和限制见 [独立包 README](../react-native-nitro-viewability/README.md)。

该共享原生依赖需要随 Android 应用重新构建，Expo Go 不能加载；本次未执行构建或设备验收。

## 复用与状态约定

- **双层复用**：RecyclerView 复用原生 holder，React 按稳定槽位身份保留同类型组件。新项目绑定到旧槽位时更新 props，不以项目 key 强制卸载重建整个 React 子树。
- **不要给 `renderItem` 返回的根组件添加 `key={item.id}`**：这会让 React 重建子树，失去该层复用收益。项目内部普通数组仍然需要正常的 React key。
- `useRecyclingState(initialValue)` 只在 `renderItem` 返回的子组件中使用，它从槽位上下文读取当前 item key，换绑后重置。普通 `useState`、`useRef` 和第三方组件内部状态不会自动重置。该 Hook 返回的 setter 用于当前绑定，不要把旧 setter 长期保存在外部。
- 需要离屏保留的收藏、编辑草稿或选中状态应在列表外按 item key 保存，以 `extraData` 和 props 传入。示例中的展开是临时状态，收藏是外部状态。
- Effect 的数据依赖必须包含 `item.id`；网络请求、定时器和订阅在 key 改变时清理或取消，丢弃旧请求结果。图片组件须使用相应复用机制，例如 `expo-image` 的 `recyclingKey`。原生的过期测量检查不能代替业务异步取消。
- `getItemType` 应返回有限、稳定的结构类型，例如 `"photo"` / `"note"`，不能把每个 item key 当类型。空闲池按类型限制容量，类型数量应保持有限。
- 数据更新使用新数组，更新项目时使用新对象。内容版本随项目对象身份、索引或 `extraData` 改变而更新；追加数据时位置不变的项目对象可继续使用原尺寸缓存。索引改变也会失效旧尺寸，因为 `renderItem` 可以根据 `index` 渲染不同内容。外部状态变更替换 `extraData` 引用；原地修改对象或集合可能无法触发正确的内容更新和尺寸失效。

普通列表使用 `LinearLayoutManager`，瀑布流使用 `StaggeredGridLayoutManager` 并启用列间空隙修正。React 内容获得列宽后测量，尺寸按项目、内容版本和列宽缓存；异步图片、文本和展开内容更新会重新报告尺寸。槽位换绑到其他项目时隐藏旧内容，完成当前绑定的提交和测量后显示；同一项目的内容更新保留当前显示和高度，待新版本提交、测量后更新。仅内容或 `extraData` 变化、项目 key/type 顺序不变时，不触发 RecyclerView 全量重新绑定，因此收藏更新不会先隐藏全部可见卡片；版本校验仍拒绝过期测量。

图片宽高已知时，应从首次渲染起为容器设置 `aspectRatio={width / height}`，让占位、加载成功和加载失败使用相同空间，避免在 `onLoad` 中改变卡片高度。示例按图片请求中的宽高预留空间，槽位复用后也直接使用新项目的比例。真实尺寸未知时，可使用固定比例裁剪，或提前获取尺寸；若加载完成后才更新高度，相邻项目仍会重新排布。

数据结构变化时，以可见项目及其屏内偏移作为滚动锚点；锚点被删除时使用邻近存活项目。在列表顶部插入或删除时保持顶部边界，展示新的首行。普通列表的高度变化恢复可见锚点，瀑布流的高度变化由布局管理器维护各列位置，避免每个测量回调反复按单个项目重设所有列偏移。瀑布流动态重排仍需要设备验收，不承诺绝对无跳动。

挂载范围由可见窗口、有限预加载和空闲池决定。当前原型保留的空闲槽位上限为每种类型 5 个、所有类型合计 40 个；活跃槽位不计入空闲池上限，尺寸缓存最多保留 4,096 项。JS 仍保存全部业务数据和项目元信息；这里限制的是 React 子树与原生 cell 数量，不表示全部内存开销都与数据量无关。

## 演示与待验收项目

根应用首页提供普通列表 / 瀑布流切换、1,000 / 10,000 条数据、两种卡片类型、异步网络图片、展开收起、外部收藏、顶部插入、删除首项、滚动控制与自定义刷新头。另提供初始 12 条的分页模式、1 条短列表和空列表，每页追加 12 条，最多追加 36 条；可模拟下一次请求失败、手动重试、查看结束状态、展开头尾以及主动加载空列表。刷新重置当前模式数据，并取消旧分页请求。切换布局或数据规模会重新挂载列表，以便分开观察计数。

`onDiagnostics` 的字段：`createdCells` 为累计原生 cell 创建数，`rebinds` 为原生换绑计数，`mountedSlots` 为当前 React 槽位数，`activeSlots` 为当前活跃槽位数，`reactMounts` 为累计 React 槽位挂载数。累计值会因回收池淘汰后重新创建而增长，开发环境 Strict Mode 也会影响挂载计数；不能仅凭累计计数判定泄漏。

以下验收尚未执行；需要明确授权相关构建和设备测试后进行：

1. 在 Android 新架构开发构建上分别快速往返滚动 1,000 / 10,000 条数据。比较当前槽位数与可见窗口，确认不会随访问过的项目数持续增加；记录 cell 创建和换绑计数。
2. 同类型复用保持组件实例；两种类型不串用。展开后快速滚离再进入，其他项目不能继承展开状态；收藏按 key 保留。在两列、滚动后及回弹结束后点击展开和收藏，包含手指轻微移动的点击，确认事件始终指向当前项目。
3. 慢网与图片加载失败场景，旧请求不能覆盖新项目；示例中已预留尺寸的图片在加载前后保持相同高度。另行验证未知图片尺寸更新、展开收起、屏幕宽度变化后的重新测量，无内容重叠、长时间空白或明显锚点跳动。
4. 在顶部、中部和底部进行插入、删除、刷新；检查锚点删除后的邻近项目行为、刷新数据的新旧版本和滚动指令。
5. 验证未达阈值、达到阈值松手、连续拖动、刷新失败、业务未确认刷新、空列表刷新、刷新中卸载页面及系统取消触摸。每个有效手势只触发一次回调，头部能回弹。
6. 验证页面反复进入退出、池内淘汰、设备旋转以及受控刷新切换，不出现重复父节点、非法挂载、残留定时器或页面销毁后的回调。
7. 普通列表与瀑布流分别使用 `gap=0`、`12`、`24`，检查卡片底部圆角、内边距与按钮完整显示；刷新头在静止时隐藏，拖动与回弹期间不绘制到列表外的工具栏或页脚。
8. 瀑布流在顶部连续插入、删除、收藏和回顶部，两列首项顶边应对齐；连续收藏时其他可见卡片不消失，且同 key/type 顺序的更新不增加换绑计数。另用会改变高度的 `extraData` 验证新尺寸仍能更新，单列切换 `gap` 后卡片不能永久隐藏。
9. 尾项设置为明显高于 `estimatedItemSize`，首次非动画滚到底部应在测量后露出完整底边；动画滚动中立即执行非动画回顶部，旧滚动不能继续覆盖位置。等待测量时触摸或更新数据，应取消旧的底部补齐。
10. 下拉尚未松手时外部设置 `refreshing=true`，分别在阈值上方和下方松手或取消触摸；刷新头保持刷新态，且不额外触发 `onRefresh`。
11. 普通列表和瀑布流分别验证首次短列表自动补页、快速滚动触底去重、追加后继续检查、达到结束状态停止；失败后留在阈值内不自动重试，点击重试可继续，刷新期间不加载。分页请求中刷新或切换数据，旧结果不能追加到新列表。
12. 空列表只显示头部、空状态、尾部，不自动请求；点击首次加载后空状态消失。展开头尾、点击其中按钮，检查全宽布局、点击范围、动态测量和业务索引；辅助内容不应进入业务 key/type 提取函数。
13. 检查总 padding、轴向 padding、具体边的覆盖关系，普通列表与瀑布流内容宽度、列间距、回顶部和包含尾部的完整底边。更新内边距和头尾高度时，不应应用旧版本测量或丢失滚动锚点。
14. 普通列表和瀑布流分别拖动后直接停止、惯性滚动、动画回顶部和到底部，检查 `idle / dragging / settling` 及拖动、惯性边界通知。对比 `scrollEventThrottle=0 / 16 / 120`，状态通知不被节流；动态测量后偏移、尺寸允许修正，事件单位为 dp，时间单调递增。
15. 可见比例使用 `0 / 50 / 100`，检查正重叠、完全可见、部分遮挡、短于 `minimumViewTime` 的快速经过和连续停留；离开再进入必须重新计时。启用 `waitForInteraction` 后首次静止不产生业务可见项，交互后恢复追踪。
16. 可见项目插入、删除、换绑、内容版本变化及头尾展开时，检查 `changed` 的进出状态、原始业务索引和最后已知项目。头尾、空状态、未准备好的隐藏槽位不能被报告；稳定集合不逐帧重复回调。退出页面或替换数据后无旧停留计时结果。

尚无项目测试框架时不额外引入测试框架；不通过自动测试命令间接触发未经授权的项目构建。
