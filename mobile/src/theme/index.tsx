import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTheme, lightTheme, type Theme } from "./tokens";

type Mode = "light" | "dark" | "system";

type ThemeCtx = {
  theme: Theme;
  mode: Mode;
  system: ColorSchemeName;
  setMode: (m: Mode) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("system");
  const [system, setSystem] = useState<ColorSchemeName>(Appearance.getColorScheme());

  // (optional) load saved mode
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem("@theme:mode");
      if (saved === "light" || saved === "dark" || saved === "system") setMode(saved);
    })().catch(() => {});
  }, []);

  // track system changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => sub.remove();
  }, []);

  const resolved = mode === "system" ? (system ?? "light") : mode;
  const theme = useMemo(() => (resolved === "dark" ? darkTheme : lightTheme), [resolved]);

  // (optional) persist
  const setModePersist = (m: Mode) => {
    setMode(m);
    AsyncStorage.setItem("@theme:mode", m).catch(() => {});
  };

  return (
    <Ctx.Provider value={{ theme, mode, system, setMode: setModePersist }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}

/** Helper to create themed StyleSheets without importing tokens everywhere */
export function createStyles<T extends Record<string, any>>(
  maker: (t: Theme) => T
) {
  return (t: Theme) => maker(t);
}
