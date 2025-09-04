import { ThemeProvider, useTheme } from "../src/theme";
import { Stack } from "expo-router";
import { StatusBar, View} from "react-native";


export default function RootLayout() {
  return (
    <ThemeProvider>
      <View style={{ flex: 1, backgroundColor: 'black' }} >
        <ThemedLayout />
      </View>
    </ThemeProvider>
  );
}

function ThemedLayout() {
  const { mode } = useTheme();
  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "black" } }} />
    </>
  );
}
