# 本次验证记录 · 2026-10-10

- Nitrogen 0.37.1：生成成功，RefreshPull 两端绑定包含 triggerDistance。
- Fabric codegen：生成成功，Android/iOS 属性包含 triggerDistance。
- TypeScript `--noEmit`：通过。
- 改动 JS/TS 文件的只读 ESLint：通过。
- Node 24 逻辑测试：26 项通过；覆盖严格参数、优先级、默认阈值跟随、定时器溢出、成功/失败/拒绝、重试、卸载、Session 生命周期、短深链接参数保留及测试入口参数。
- Python 脚本离线测试：7 项通过；覆盖诊断解析、视口内手势距离、超出视口拒绝、冷启动、重复查询参数 shell 引号及返回码为零但实际不支持的设备命令。
- Python 脚本语法检查：通过。
- 手写源码差异检查：通过。Nitrogen 生成的 Swift 空白行有生成器自带尾随空格，未手工修改生成文件。

## Android 真机验收

设备：Huawei ELE-AL00，API 29，arm64-v8a。

根据用户测试授权，在可见 PowerShell 终端执行 `:app:assembleDebug -PreactNativeArchitectures=arm64-v8a --console=plain`，构建成功并安装本次 APK。终端保留进度与最终结果。

以下均在匹配本次原生绑定的开发客户端实际执行并通过：

- 原生接口预检：头高度 60、阈值 90，刷新停留 60、进度约 0.667。
- 三种容器 × 长/短/空内容 × 默认/Lottie 头：18 个组合。
- 高度/阈值组合 90/40、60/60、60/90、30/130：阈值以下取消、超过阈值只请求一次，超过旧 Android 上限仍可触发。
- 就绪后回拉取消、峰值进度超过 1、刷新/滚动禁用、非顶部下拉、行点击、拖动取消点击、刷新锁定与结束恢复。
- 成功、失败、拒绝及再次请求。
- 全部八个命名生命周期场景；阈值更新使用显式初始阈值 60，验证同实例更新到 120。
- 刷新中卸载、双实例隔离、导航离开后重新进入。
- 非法路由参数显示错误且不挂载原生组件，重复参数经深链接验证。
- 禁用时受控初始刷新仍可执行，主动 begin 请求被拒绝。

测试发现并修复了 `myapp://refresh-demo?...` 短链接路由问题，新增 native-intent 归一化及回归测试。设备不支持 `input event`，脚本改用实测可用的 `input motionevent` 并检查错误文本。Metro 的 IPv6 localhost 与 ADB reverse 不匹配，通过启动参数 `--dns-result-order=ipv4first` 解决，无项目配置改动。

本地证据位于忽略目录 `tests/artifacts/`：构建日志及结果、18 组合运行日志、gestures/lifecycle/parameters/disabled-requests 各套件通过日志。最初失败快照仅用于诊断，相关套件已重跑通过。

## 外观与未执行项

新增 `/refresh-tests` 列表的 57 个入口已校验：标识唯一、有效参数可解析、非法参数按预期拒绝、重复参数在 URL 中保留。TypeScript 与只读 ESLint 通过。Android 真机实际验证启动页进入列表、点击默认项参数正确、返回列表、滚动到重复参数项并显示具体错误、再次返回列表。证据为 `artifacts/test-list.log` 与 `refresh-tests.png`；此次仅更新 JavaScript，使用已安装开发客户端，无新增原生构建。

浅色、安全区、大字体（font_scale=1.5）布局检查通过。关闭系统动画后，Lottie 刷新头两次截图区域完全一致。设备设置在检查后恢复原值，证据为 `appearance-result.json` 与截图。

深色模式未实际执行：该设备 `dumpsys uimode` 显示 `mNightModeLocked=true`，`cmd uimode night yes` 仍返回 `Night mode: no`。浅色截图不能作为深色通过证据。

iOS 构建及手势矩阵未执行：当前 Windows 环境没有可用的 iOS 开发客户端。系统手势取消、多指切换、小屏设备及减少动态效果下原生回弹的人工观感检查未执行，仍需按 `ACCEPTANCE.md` 补验。Android 自动化通过不替代这些记录。
