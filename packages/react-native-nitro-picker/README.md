# react-native-nitro-picker

Android / iOS 的受控嵌入式立体滚轮。Fabric 挂载 React 选项，Nitro 同步选中值和选择事件，Reanimated UI worklet 根据原生滚动偏移计算圆柱透视。需要包含本子包的新架构开发客户端；Expo Go 不包含本子包。Web 不支持。

```tsx
import { useState } from "react";
import { Text } from "react-native";
import { PickerView, PickerViewColumn } from "react-native-nitro-picker";

// 示例数据
const seasons = ["春", "夏", "秋", "冬"];

export function SeasonPicker() {
  const [value, setValue] = useState([0]);
  return (
    <PickerView value={value} onChange={({ value: next }) => setValue(next)}>
      <PickerViewColumn
        accessibilityLabel="季节"
        accessibilityValueText={seasons[value[0]]}
      >
        {seasons.map((season) => (
          <Text
            key={season}
            className="text-lg text-slate-900 dark:text-slate-100"
          >
            {season}
          </Text>
        ))}
      </PickerViewColumn>
    </PickerView>
  );
}
```

## 接口

`PickerView` 的 `value` 是必填的零基列索引数组。`itemHeight` 默认 44，默认容器高度 220，`enabled` 默认 true。支持容器 `className` / `style`、`indicatorClassName` / `indicatorStyle`、`maskClassName` / `maskStyle`、`testID`。选中框的中心位置和行高由组件控制；样式可改边框、背景等外观。

默认背景与遮罩适配白色 / slate-950 深色主题。修改背景时，使用 `maskColors={[opaqueColor, transparentColor]}` 同步设置上下渐隐颜色。原生滚动事件仅连接 UI worklet，应用层没有逐帧事件。

`PickerViewColumn` 必须是直接子项，每个非空 React 子元素算一项；片段作为一个选项内容。裸文本需要放入 `Text`。使用稳定且唯一的选项 key；选项允许图文布局，但内部交互被禁用，整列负责滚动。列支持 `className` / `style`、`accessibilityLabel`、`accessibilityValueText`、`testID`。全部选项使用统一行高，内容应在槽内排版。

- `onPickStart({ column })`：用户开始拖动或使用辅助功能调整。
- `onChange({ value, column, index })`：停止并吸附后索引发生变化；调用方应更新 `value`。不更新即恢复原受控位置。
- `onPickEnd({ column })`：该次选择结束，在 `onChange` 之后；内容、尺寸、启用状态或受控值更新取消滚动时也结束已开始的选择。卸载不会向已卸载组件继续发送回调。

程序更新不触发 `onChange`；滚动中更新会结束旧选择并触发 `onPickEnd`。超范围索引夹到首尾，缺少的索引取 0，空列的索引为 -1。输入索引必须为有限整数，行高必须为正有限数。联动由业务更新下游选项及其索引，不内置日期、地区数据或弹窗。

首次读取系统减少动态效果设置前，以及设置开启时，使用平面滚轮。惯性与吸附使用平台滚动组件，程序选中值更新直接定位，不添加自编原生动画。

## 原生接入与生成

跟随 workspace 自动链接；Android 使用 RecyclerView 1.4.0（compileSdk 至少 35），iOS 使用 UIScrollView。每列拥有独立的弱引用 Nitro 控制器。所有 React 选项先挂载，Android 仅回收包装槽，不将一个选项的 React host 复用于其他选项；不承诺大型数据列表的 JS 虚拟化。

在本包目录执行 `pnpm nitrogen` 和 `pnpm codegen` 更新绑定。这两个脚本只生成代码，不触发 Gradle、CocoaPods 或原生编译。不要手工修改 `generated/`、`nitrogen/generated/`。

演示路由：`/picker-demo`；独立测试路由：`/picker-tests`，两页可互相跳转。测试页提供双列图文、联动、拒绝变更、内容增删/替换/重排、程序更新、尺寸、禁用和卸载操作，并记录实际回调。原生二进制需要重新构建才能包含新增子包。

## 验收

检查清单与当前验证范围见 [ACCEPTANCE.md](./ACCEPTANCE.md)。
