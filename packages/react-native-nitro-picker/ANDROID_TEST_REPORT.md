# Android 真机测试记录

2026-10-10：华为 ELE-AL00，Android 10 / API 29，arm64-v8a，1080 × 2340。

已在可见终端执行 `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a --console=plain`，安装成功并连接 Metro，从首页入口进入 `/picker-tests`。终端保留成功输出。滚动优化后 APK SHA-256：`CA94842499717FF086CC22F1B83A1E5939281818C184E31B241BADFB8D9D51AF`。

## 本轮发现和修复

- 选项内容偏上：静态居中布局改由普通 View 承担，Animated.View 仅接收运行时行高和动画样式；重新启动后内容居中。
- 外层 ScrollView 抢占列拖动：可用且非空列从 ACTION_DOWN 起保留手势，UP/CANCEL 后交还。原生重新构建、安装后复测通过。
- 白色透明演示图标在浅色背景不可见：增加演示图片底色。
- Link 样式未生效：改为 `Link asChild` 包装带 NativeWind 样式的 Text，修复深色主题下链接不可读。

## 实际检查

| 场景 | 真机观察 |
| --- | --- |
| 首页、初始挂载 | 独立测试页可打开；文字和图片在选中框中心 |
| 拖动、快速甩动 | 索引更新并吸附；实际回调顺序 start → change → end |
| 双列同时滑动 | UIAutomator 真实双指纵向手势；两列均更新，复测 `[3, 2]`，前一次 `[4, 2]`；截图索引与正面选项一致 |
| 首尾、缺省、越界 | 首尾居中；缺省回到首项；`[99, -99]` 显示夹取后的末项/首项 |
| 程序更新 | 空闲更新没有用户事件；滚动开始即更新后保持 `[7, 7]`，旧滚动未提交 change |
| 拒绝变更 | 请求 change 后恢复 `[0, 0]` |
| 内容增删、重排、替换 | 内容随输入更新；空列无可见选项；恢复后可继续使用 |
| 联动 | 左列拖动后 `[3, 0]`；右列从 8 项缩为 5 项 |
| 滚动中更新内容 | start 即缩短列；只记录 start → end，无迟到 change；最终 `[0, 0]`、3/3 项 |
| 滚动中卸载 | start 即卸载，原生列节点消失；等待后未见新回调；重新挂载正常 |
| 禁用、嵌套滚动 | 禁用时值不变，外层可滚动；启用时列拖动不再被外层抢占 |
| 尺寸 | 220/44、300/52、20/44；窄高度首尾仍居中并均匀裁切 |
| 曲面、图文、遮罩 | 图文共同投影，上下旋转、压缩及渐隐可见 |
| 减少动态效果 | 动画设置临时设为 0 后使用平面；恢复原值 1.0 后恢复曲面 |
| 深浅主题 | 通过华为系统“全天开启”验证深色滚轮与遮罩；结束后恢复关闭状态 |
| 辅助功能动作 | 原生增减动作使 `[0, 0] → [1, 0] → [0, 0]`；UIAutomator 断言通过 |

本轮读取的 AndroidRuntime / ReactNativeJS 日志未见应用 FATAL EXCEPTION。8 项 Node 回归测试、全项目 TypeScript、所改源码 ESLint 通过。

## 滚动开销优化复测

- 背面选项返回固定的透明矩阵样式，跳过三角函数和重复原生属性提交；平面模式也复用同一矩阵。
- Android 额外挂载范围按实际圆柱半径计算，从 `height * π / 2` 改为 `max(itemHeight, height / 2) * π / 2`，保留曲面所需行；原生惯性和吸附行为不变。
- 优化后增量构建成功（28 秒），重新安装。8 项 Node 测试、TypeScript、ESLint 通过；UIAutomator 两项测试通过，双指结果 `[4, 2]`；快速甩动后 `[4, 7]`，选项居中、曲面及图文显示正常。
- 开发包单轮 `dumpsys gfxinfo` 采样：从末项开始，左列交替执行 `(290,1240) → (290,930)` 及反向、每次 350ms，共 6 轮。修改前 264 帧、49 慢帧（18.56%），P50/P95 为 14/20ms；修改后 284 帧、37 慢帧（13.03%），P50/P95 为 13/18ms。启动及页面切换不包含在采样范围内。
- 该采样包含开发环境开销，帧数不同，且仅一次前后对比，不能作为稳定的性能收益或发布包验收结论。尚未进行 release 性能测试和 iOS 运行验证。

优化后采样、双指回归输出及截图保存在 `tests/artifacts/android-20261010/smooth-*`。

## 证据及复测

截图、UI XML 和运行日志在 [tests/artifacts/android-20261010](./tests/artifacts/android-20261010/)。主要截图：[初始居中](./tests/artifacts/android-20261010/initial-fixed.png)、[双指滑动](./tests/artifacts/android-20261010/multi-pass.png)、[窄高度末项](./tests/artifacts/android-20261010/compact-last.png)、[平面降级](./tests/artifacts/android-20261010/reduced-motion.png)、[深色主题](./tests/artifacts/android-20261010/dark-wheel.png)。

测试源码：[PickerMulti.java](./tests/android-device/PickerMulti.java)。使用 SDK 28 的 uiautomator.jar、android.test.base.jar 编译，Build Tools 36.0.0 的 d8 生成 classes.dex，打包临时 jar 并推送至 `/data/local/tmp`。执行 `adb shell uiautomator runtest picker-multi4.jar -c PickerMulti` 的实际输出为 `OK (2 tests)`；不能仅以 adb 退出码判定通过。应用没有新增测试依赖。复测前打开默认测试页，保持启用、接受变更、关闭联动且没有待执行的 start 操作。

测试页的“滚动开始即卸载 / 更新值 / 缩短列”在实际 native start 回调中执行操作，避免把停止后的操作误计为中断测试。

## 未覆盖

未启用 TalkBack 检查实际朗读、焦点导航和读屏触摸体验；仅验证原生辅助功能增减动作。其他 Android 机型、长期性能/内存、屏幕旋转、自定义列宽未验证；iOS 编译和运行未执行。本记录不表示完整双端验收完成。
