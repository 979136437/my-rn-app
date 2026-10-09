import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "../../global.css";


SplashScreen.setOptions({ duration: 1000, fade: true });
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "ios_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen
              name="(startup)"
              options={{
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="(tabs)"
              options={{
                animation: "none",
              }}
            />
          </Stack>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
