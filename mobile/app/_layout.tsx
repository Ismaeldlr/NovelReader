import { ThemeProvider, useTheme } from "../src/theme";
import { Stack } from "expo-router";
import { StatusBar, View } from "react-native";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedLayout />
    </ThemeProvider>
  );
}

function ThemedLayout() {
  const { theme, mode } = useTheme();
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar translucent backgroundColor="transparent" barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <View style={{ height: StatusBar.currentHeight, backgroundColor: theme.colors.bg }} />
    </>
  );
}
