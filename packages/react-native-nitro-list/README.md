# react-native-nitro-list

Android 原生列表原型：`RecyclerView` 负责滚动、布局和 cell 回收，Fabric 承载 React 内容，Nitro HybridObject 提供列表控制接口。支持纵向列表、动态高度瀑布流、同类型 React 子树复用以及 React 自定义下拉刷新头。

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

根应用首页提供普通列表 / 瀑布流切换、1,000 / 10,000 条数据、两种卡片类型、异步网络图片、展开收起、外部收藏、顶部插入、删除首项、滚动控制与自定义刷新头。切换布局或数据规模会重新挂载列表，以便分开观察计数。

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

尚无项目测试框架时不额外引入测试框架；不通过自动测试命令间接触发未经授权的项目构建。
