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

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

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
