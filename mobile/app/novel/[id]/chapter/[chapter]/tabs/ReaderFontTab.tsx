import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { createStyles, useTheme } from "../../../../../../src/theme";

type Props = {
  fontFamily?: string;
  fontSize: number;
  lineHeight: number | "default";
  onFontFamily: (f?: string) => void;
  onFontSize: (n: number) => void;
  onLineHeight: (v: number | "default") => void;
};

const FONTS = ["Nunito Sans", "Roboto", "Lora"] as const;

export default function ReaderFontTab({ fontFamily, fontSize, lineHeight, onFontFamily, onFontSize, onLineHeight }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);

  function bump(delta: number) {
    onFontSize(Math.min(28, Math.max(10, fontSize + delta)));
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Font family */}
      <View style={s.card}>
        <Text style={s.title}>Font</Text>
        <View style={s.segment}>
          {FONTS.map((f, i) => {
            const active = fontFamily === f;
            return (
              <Pressable key={f} onPress={() => onFontFamily(f)} style={[s.segBtn, active && s.segBtnActive, i > 0 && s.segDivider]}>
                <Text style={[s.segTxt, active && s.segTxtActive]}>{f}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Font size */}
      <View style={s.card}>
        <Text style={s.title}>Font Size</Text>
        <View style={s.triRow}>
          <Pressable style={s.blockBtn} onPress={() => bump(-1)}><Text style={s.blockTxt}>A-</Text></Pressable>
          <View style={[s.blockBtn, { flex: 1 }]}><Text style={s.blockTxtCenter}>{fontSize}</Text></View>
          <Pressable style={s.blockBtn} onPress={() => bump(1)}><Text style={s.blockTxt}>A+</Text></Pressable>
        </View>
      </View>

      {/* Line height */}
      <View style={s.card}>
        <Text style={s.title}>Line Height</Text>
        <View style={s.triRow}>
          <Pressable style={s.blockBtn} onPress={() => onLineHeight(typeof lineHeight === "number" ? Math.max(1.1, (lineHeight as number) - 0.1) : 1.1)}>
            <Text style={s.blockTxt}>Height -</Text>
          </Pressable>
          <Pressable style={[s.blockBtn, { flex: 1 }]} onPress={() => onLineHeight("default")}>
            <Text style={s.blockTxtCenter}>Default</Text>
          </Pressable>
          <Pressable style={s.blockBtn} onPress={() => onLineHeight(typeof lineHeight === "number" ? Math.min(2, (lineHeight as number) + 0.1) : 1.3)}>
            <Text style={s.blockTxt}>Height +</Text>
          </Pressable>
        </View>
      </View>

      {/* Term colors toggle placeholder */}
      <View style={s.card}>
        <Text style={s.title}>Term Colors</Text>
        <View style={s.segment}>
          <Pressable style={[s.segBtn, s.segBtnActive]}><Text style={[s.segTxt, s.segTxtActive]}>Enabled</Text></Pressable>
          <Pressable style={[s.segBtn, s.segDivider]}><Text style={s.segTxt}>Disabled</Text></Pressable>
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

  triRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  blockBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: t.colors.card,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  blockTxt: { color: t.colors.text, fontWeight: "700" },
  blockTxtCenter: { color: t.colors.text, fontWeight: "800", textAlign: "center" },
}));
