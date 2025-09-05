import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { createStyles, useTheme } from "../../../../../../src/theme";

export default function ReaderSettingsTab() {
  const { theme } = useTheme();
  const s = styles(theme);
  const [mode, setMode] = useState<"light" | "dark">("dark");

  return (
    <View style={{ gap: 10 }}>
      <View style={s.card}>
        <Text style={s.title}>Website Theme</Text>
        <View style={s.segment}>
          <Pressable style={[s.segBtn, mode === "light" && s.segBtnActive]} onPress={() => setMode("light")}>
            <Text style={[s.segTxt, mode === "light" && s.segTxtActive]}>Light</Text>
          </Pressable>
          <Pressable style={[s.segBtn, s.segDivider, mode === "dark" && s.segBtnActive]} onPress={() => setMode("dark")}>
            <Text style={[s.segTxt, mode === "dark" && s.segTxtActive]}>Dark</Text>
          </Pressable>
        </View>
        <Text style={s.note}>Theme toggle is UI-only for now.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.title}>Reader Theme</Text>
        <View style={[s.segment, { justifyContent: "space-between" }]}>
          {["Aa", "Aa", "Aa", "Aa", "Aa"].map((x, i) => (
            <View key={i} style={[s.themeSwatch, i === 3 && s.themeSwatchActive]}>
              <Text style={s.themeTxt}>“Aa”</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.title}>Reader Type</Text>
        <View style={s.segment}>
          <Pressable style={[s.segBtn, s.segBtnActive]}><Text style={[s.segTxt, s.segTxtActive]}>Single Page</Text></Pressable>
          <Pressable style={[s.segBtn, s.segDivider]}><Text style={s.segTxt}>Infinite</Text></Pressable>
          <Pressable style={[s.segBtn, s.segDivider]}><Text style={s.segTxt}>Old Reader</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  card: {
    backgroundColor: t.colors.bgElevated,
    borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    padding: 10,
    gap: 8,
  },
  title: { color: t.colors.text, fontWeight: "800", marginBottom: 2 },
  note: { color: t.colors.textDim, fontSize: t.font.sm },

  segment: {
    flexDirection: "row",
    backgroundColor: t.colors.card,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    overflow: "hidden",
  },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8 },
  segBtnActive: { backgroundColor: t.colors.bg },
  segTxt: { color: t.colors.textDim, fontWeight: "700" },
  segTxtActive: { color: t.colors.text },
  segDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.colors.border },

  themeSwatch: { flex: 1, alignItems: "center", paddingVertical: 8 },
  themeSwatchActive: { backgroundColor: t.colors.bg },
  themeTxt: { color: t.colors.text },
}));
