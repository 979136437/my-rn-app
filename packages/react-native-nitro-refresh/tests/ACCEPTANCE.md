# 独立阈值原生验收清单

仅使用包含本次 Nitro 和 Fabric 绑定的开发客户端。页面地址为 `myapp://refresh-demo`；无需控制按钮。所有结果为本地模拟。

## 两端公共矩阵

在 Android 与 iOS 分别验证 `container=scroll-view|flat-list|section-list` × `content=long|short|empty` × `header=default|lottie` 的 18 个组合。

每个组合：下拉至 ready，松手只产生一次请求；成功后版本增加一，最终 idle、offset=0、isDragging=false。空/短内容仍能触发。Lottie 拖动跟随触发进度，刷新循环，结束停止。

| 参数或操作 | 预期 |
| --- | --- |
| headerHeight=90&triggerDistance=40 | 到 40 dp 松手触发，刷新停留 90 dp |
| headerHeight=60&triggerDistance=60 | 与旧默认行为一致 |
| headerHeight=60&triggerDistance=90 | 到 90 dp 触发，刷新停留 60 dp，刷新进度约 0.667 |
| headerHeight=30&triggerDistance=130 | 可超过旧 Android 最大下拉距离并触发 |
| 阈值以下松手 | 不请求，回到 idle/0 |
| 超过阈值后回拉至阈值以下，再松手 | 曾出现 ready，最终不请求 |
| 手势被系统取消、反向到零、多指切换 | 不误触发、不残留锁定或拖拽标志 |
| initialOffset=180，在非顶部下拉 | 正常滚动，不提前请求；到顶后可继续下拉 |
| enabled=false | 手势不请求 |
| scrollEnabled=false | 列表不滚动、手势不请求，受控刷新不改写该属性 |
| 点击数据行，再从数据行开始拖动 | 点击计数仅增加一次；拖动取消点击 |
| refreshDurationMs=20000，刷新时双向拖动和行点击 | 纵向滚动锁定；点击仍可用；结束后恢复滚动 |
| result=failure / reject，然后再次下拉 | 版本不变，任务结束，可以再次请求 |
| result=success，然后再次下拉 | 请求和版本逐次增加 |

## 生命周期

逐个打开 `scenario`：

| scenario | 预期 |
| --- | --- |
| initial-refresh | 无操作自动刷新、结束；请求数 0 |
| begin-twice | 无操作主动刷新、结束；请求数 1 |
| disable-refreshing | 下拉触发后 enabled=false，任务仍正常结束 |
| reopen-finishing | 一次下拉，自动完成两轮；请求 1、版本 2 |
| update-height | 一次下拉，头高度从 60 到 120；未传阈值时阈值同步到 120 |
| update-threshold | 首次拖动后阈值从 90 到 180；继续拉到新阈值才就绪 |
| unmount-refreshing | 刷新开始后 A 消失，等待耗时后没有晚到更新或报错 |
| two-instances | A 刷新并卸载后 B 仍能独立下拉，完成且回到 idle |

刷新中导航离开，再返回默认地址：请求、版本、状态和峰值重置，没有旧回调影响新页面。修改路由参数重建实例；高度/阈值场景内部更新不重建。

## 参数与视觉

- 逐项验证重复参数、空参数、未知参数、错误枚举/布尔值、0 高度、负数、NaN、Infinity、溢出、非十进制格式：显示具体错误，无刷新组件。
- 浅色、深色、小屏、系统大字体：说明和诊断可读，滚动区域可用，不被安全区覆盖。
- 开启减少动态效果：Lottie 静态帧、箭头及原生回弹尊重系统设置；恢复设置后再次验证。
- 记录平台、设备、系统版本、客户端原生版本、参数、实际请求/版本/状态及失败 UI 快照。未执行项标记“未执行”，不能写为通过。

Android 脚本覆盖可自动化的主要场景；系统取消、多指、视觉及 iOS 需按此清单手工验收。
