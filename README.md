# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   pnpm install
   ```

2. Start the app

   ```bash
   pnpm start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## pnpm workspace

Use pnpm 10.33.0, as specified in `package.json`.

The project uses `node-linker=hoisted` in `.npmrc` to keep native dependency
paths short on Windows. This avoids deeply nested pnpm paths causing the
Android SDK's Ninja to repeatedly regenerate `build.ninja`.

The root Expo app is automatically included in the workspace. Additional apps
can be added under `apps/*` and shared packages under `packages/*`, each with its
own `package.json`. Declare local package dependencies with `workspace:*`.

Run `pnpm install` from the workspace root to install dependencies for all packages.
Use `pnpm --filter <package-name> <script>` to run a script in a specific package.

## Android 原生列表与功能测试

Workspace 包 [react-native-nitro-list](packages/react-native-nitro-list/README.md)
公开 `NativeList`、`NativeSectionList`、`useListContext` 和 `useRecyclingState`。
支持动态高度列表/瀑布流、固定头部占位或覆盖、分组与多层同层互斥吸顶、
头部上下方刷新、滚动定位，以及通过 SharedValue 实现透明头部变色。
包名和内部 Fabric/Nitro 原生注册名保持不变；原 `NitroList` 公开入口更名为 `NativeList`，
相关公开类型改为 `NativeList*`，分组组件类型为 `NativeSectionList*`。

应用实际路由目录是 `src/app`。首页改为入口目录，原瀑布流、普通列表、分页、短列表、空列表、1,000 条、10,000 条选项分别打开 `src/app/list-demos` 下的独立页面，并提供“列表功能测试”入口，
打开 `/nitro-list-tests` 测试目录，分别进入头部与刷新、分组与吸顶、Hook 与透明头部、平面列表定位、分组列表定位五个独立页面。
测试页面使用本地数据，提供模式开关、操作说明、事件日志、指标和场景重置。
同场景配置切换保留列表实例，便于观察动态布局问题；Expo Go、iOS 和 Web 显示不可用说明。

需要包含自定义原生包的 Android development build。更新原生代码后需要由开发者
明确执行重新构建，Metro 热更新不能替代。当前未执行原生编译或设备验收；
交互测试页面及静态检查不代表手势、吸顶复用、定位精度和性能已经通过验收。
完整 API、示例、坐标规则及待验收清单见包 README。

## Android 组件曝光

Workspace 包 [react-native-nitro-viewability](packages/react-native-nitro-viewability/README.md)
提供 `ExposureObserver` 包装组件和 `useExposureObserver` 无包装 Hook，基于同一
Nitro 原生会话计算可见面积和连续停留时间。Hook ref 应指向设置了
`collapsable={false}` 的原生 View；路由失焦或业务浮层覆盖时由调用方设置 `active=false`。
默认阈值为 `50%`、停留 `0 ms`，重新进入可再次曝光，业务自行去重。
纯可见性监控可只使用 `onVisibilityChange`，将停留时间设为 `0` 来控制视频暂停。
Android 窗口失焦（例如通知栏导致失焦）或宿主暂停时通知不可见并清空计时，
恢复获焦后重新判断；路由焦点仍需通过 `active` 传入，恢复播放由业务决定。

演示页包含包装广告、Hook 按钮、暂停 / 恢复开关与重新进入计数，同时保留
NativeList 的 `onViewableItemsChanged`。独立观察按面积计算；NativeList 复用同一
Kotlin tracker，但保留列表垂直可见高度比例、槽位版本与业务索引语义。
观察不识别兄弟浮层、圆角或任意形状的像素遮挡。

首版仅支持 Android，Expo Go 不支持。接入或更新原生代码后需要重新构建
Android development build；Metro 热更新不能替代。当前未完成原生编译与设备运行验收。

## Android 国内 Maven 镜像

Android 主工程及其依赖子项目的 Google Maven、Maven Central 使用阿里云镜像：

- Google Maven：`https://maven.aliyun.com/repository/google`
- Maven Central：`https://maven.aliyun.com/repository/central`

`plugins/withAndroidMavenMirrors.js` 在 Expo 生成原生工程时将配置写入
`android/settings.gradle`，覆盖项目依赖和各子项目的 `buildscript` 依赖仓库，
包括 Gesture Handler、Screens 和 Expo Dev Launcher。当前原生工程也已同步。
后续重新生成原生工程会保留此配置，不需要修改 `node_modules` 或清空 Gradle 缓存。

镜像配置保留 HTTPS 和证书校验。Gradle distribution、npm、JitPack，以及
React Native/Expo 插件自身独立 included build 的仓库不在此配置范围内。
本机的 Gradle 代理设置仍然生效；若代理对国内域名不稳定，需要在代理软件中将
`maven.aliyun.com` 设置为直连。镜像连通性已检查，尚未通过项目构建验证。

## Get a fresh project

When you're ready, run:

```bash
pnpm reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
