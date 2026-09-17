# react-native-nitro-picker

Android 嵌入式原生滚轮选择器。复用 React Native 自带的 Fabric ScrollView 承载自定义 React 选项；Nitro 控制器在 Android UI 线程处理触摸、使用 OverScroller 计算惯性及吸附，并同步选中值与中止滚动，无 JS 逐帧驱动，也不新增重复的 Fabric 组件。提供 `PickerView` 和 `PickerViewColumn`，支持多列及由业务管理的数据联动。

首版完整挂载所有选项，没有虚拟化或 React 子树回收，适用于数量适中的选择列表。无弹窗、确认按钮、循环滚动和内置地区数据。

## 接入

通过 workspace 依赖接入，使用 React Native 新架构及包含此包的 Android development build。Nitro / Nitrogen 版本与项目保持一致，为 **0.37.1**。Expo Go、iOS 和 Web 不支持挂载；非 Android 平台仅导入公开入口不会加载原生实现，尝试挂载时会得到不支持提示。

Nitrogen 绑定位于 `nitrogen/generated`，变更 `.nitro.ts` 接口后执行 `pnpm --filter react-native-nitro-picker codegen:nitro`，生成文件不应手工修改。Android 原生代码和 Fabric 配置变更需要重新构建开发客户端，Metro 热更新无法替代原生构建。

**本次实现未执行原生编译、自动测试或设备验收。** Android 实际挂载、手势、布局及无障碍行为仍待设备验证。本仓库执行项目构建需要用户明确授权。

## 基本用法

```tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { PickerView, PickerViewColumn } from 'react-native-nitro-picker';

export function Example() {
  const [value, setValue] = useState([1]);
  return (
    <PickerView value={value} onChange={event => setValue(event.value)}>
      <PickerViewColumn accessibilityLabel="季节">
        {['春', '夏', '秋', '冬'].map(label => <Text key={label}>{label}</Text>)}
      </PickerViewColumn>
    </PickerView>
  );
}
```

不传 `value` 时使用非受控模式，可通过 `defaultValue` 设置初始索引。自定义选项可以包含图标、文本等 React 内容；每个选项的外层高度统一由 `itemHeight` 决定。为选项提供稳定的 React key。

## 接口

`PickerView` 的直接子元素为 `PickerViewColumn`。

| 属性 | 类型 | 默认值 / 行为 |
| --- | --- | --- |
| `value` | `number[]` | 受控索引，各列从零开始 |
| `defaultValue` | `number[]` | 非受控初始值，缺失索引按零处理 |
| `onChange` | `({ value: number[], columnIndex: number }) => void` | 用户选择变化，返回完整列索引及本次变化列 |
| `itemHeight` | `number` | 44 dp；所有列使用相同行高 |
| `immediateChange` | `boolean` | `false`；惯性和吸附结束后通知 |
| `indicatorStyle` | RN `ViewStyle` 样式 | 居中指示框；高度由 `itemHeight` 决定 |
| `maskStyle` | RN `ViewStyle` 样式 | 上下渐隐遮罩的样式 |
| `onPickStart` | `({ columnIndex: number }) => void` | 用户滚动周期开始 |
| `onPickEnd` | `({ columnIndex: number }) => void` | 用户滚动周期结束 |
| `style` | RN View 样式 | 默认高度 220 dp |

`PickerViewColumn` 支持 `children`、`style` 和 `accessibilityLabel`。各列默认等宽，可通过 `style` 中的 `flex` 调整比例。提供可读的 `accessibilityLabel`，以便辅助功能区分各列；列支持无障碍递增和递减选择。

首尾留白使第一项与最后一项均可居中。指示框和遮罩不拦截手势。使用有明确宽度的容器，高度至少为 `itemHeight`，避免把高于行高的内容放入选项。选项仅承载展示内容，内部按钮不接收点击；整个列由滚轮手势和无障碍调整操作控制。

可以嵌入 React Native 的纵向 `ScrollView`：在选择器列内按下后，该次手势由选择器独占，空列、首尾边界以及拖动中数据或布局变化也不会将手势交给外层页面；移动到列外仍保持独占，直到松手或系统取消。在选择器外开始拖动则滚动页面，无需在业务侧切换外层 `scrollEnabled`。内部内容容器关闭触摸命中，使 Nitro 在按下时取得完整手势；松手、取消、卸载或应用进入后台时释放祖先拦截限制。原生手势修改需要重新构建 Android 开发客户端后验收；不接管已经由外层取得的手势或自定义手势库的独立识别器。

`maskStyle.backgroundColor` 设置渐隐遮罩外沿颜色（默认为白色），向中间选中行过渡至透明；可通过 `opacity` 调整强度。指示框与遮罩的位置和高度由组件管理，布局样式不能覆盖行高。

`indicatorStyle` 应用于横跨全部列的单个选中框，圆角只出现在整体两端，不在列之间重复。需要闭合的圆角边框时设置 `borderWidth` 和 `borderRadius`；只设置上下边框会保留两侧开口。

选中框背景绘制在选项下方，可使用不透明颜色；边框绘制在上方。列设置纵向内边距时，首尾留白和渐隐区域按内侧实际视口计算。演示页的季节列同时展示不透明选中背景与 `paddingVertical: 8`。

## 数据与事件

- 索引缺失、非法时按零处理；越界时夹取边界；空列为 `-1`。数据缩减、列增删后重新归一化，过期滚动事件不会覆盖新数据。
- 程序更新 `value`、数据归一化不会触发 `onChange`。受控模式下需要在 `onChange` 中更新外部值；业务展示应使用归一化后的索引，不能假设传入的越界值被组件写回。
- 多列分别管理滚动，回调的 `value` 包含最新完整索引。一次手势及其惯性、吸附属于一次滚动周期。
- `immediateChange=true` 时松手确定目标项后提前通知；最终落点与提前通知不同时补发，相同值不重复通知。
- 松手时用 Android 惯性预测目标行，再以连续减速曲线停靠，避免惯性结束后再次启动吸附。轻拖归位时长随距离调整，停靠末端速度为零，不做弹跳或反向修正。
- 惯性途中按住会暂停动画；即使没有继续拖动，松手后也会吸附到最近选项并提交最终索引，避免显示位置与选中值不一致。
- 拖动位置按系统显示帧合并更新，保留小数位移；松手先提交最后的触摸位置再计算惯性。起步扣除系统触摸阈值，避免首个批量移动事件造成跳动。
- 外部选中值、数据变更可中断正在进行的滚动；尺寸改变会重新居中，布局未完成时定位请求暂存，卸载释放原生连接和监听。
- 日期、省市区等联动由业务更新列内容。例如切换年月后缩减日期列，同时将受控日期索引夹取到本月最后一天。

项目首页的“滚轮选择器”入口提供非受控图文选项、日期联动、程序设置、动态清空与恢复、尺寸调整及事件日志。

## 与微信组件的关系

设计参考微信官方 [picker-view](https://developers.weixin.qq.com/miniprogram/dev/component/picker-view.html) 和 [picker-view-column](https://developers.weixin.qq.com/miniprogram/dev/component/picker-view-column.html) 的嵌入式多列选择能力，不承诺逐项兼容。

这里使用 React 子节点与 RN 样式对象，不支持 WXML、WXSS 字符串或样式类；事件采用回调对象而非 `event.detail`，附加变化列索引。行高由 `itemHeight` 统一控制，空列明确为 `-1`。`immediateChange` 按本文定义的原生目标项通知时机执行。微信专属平台属性不在公开接口内。

## 待设备验收

在包含此包的 Android 开发客户端检查：快速甩动与首尾吸附、两列同时滚动、受控更新打断滚动、31 日切换二月及闰年、缩减/清空/恢复列、增加删除列、容器尺寸变化、返回页面卸载，以及 TalkBack 递增递减。分别观察 `immediateChange` 开启和关闭时的事件顺序与去重，并检查图文选项位置和外层页面滚动手势。
