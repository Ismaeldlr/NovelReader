import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { createStyles, useTheme } from "../../../../../../src/theme";

export default function ReaderMoreTab() {
  const { theme } = useTheme();
  const s = styles(theme);
  return (
    <View style={s.card}>
      <Text style={s.title}>More</Text>
      <Text style={s.text}>No options here yet. Coming soon.</Text>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  card: {
    backgroundColor: t.colors.bgElevated,
    borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    padding: 12,
  },
  title: { color: t.colors.text, fontWeight: "800", marginBottom: 6 },
  text: { color: t.colors.textDim },
}));
