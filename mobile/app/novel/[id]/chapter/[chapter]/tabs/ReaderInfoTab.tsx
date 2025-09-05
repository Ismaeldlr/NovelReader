import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createStyles, useTheme } from "../../../../../../src/theme";

type Props = {
  idx: number;
  total: number;
  readPct: number; // 0..1
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onOpenContents: () => void;
  onOpenAbout: () => void;
};

export default function ReaderInfoTab(props: Props) {
  const { theme } = useTheme();
  const s = styles(theme);

  const pctLabel = `${Math.round(props.readPct * 1000) / 10}%`;

  return (
    <View style={{ gap: 8 }}>
      {/* Top: prev / current / next */}
      <View style={s.rowCard}>
        <Pressable style={[s.arrowBtn, props.prevDisabled && s.disabled]} onPress={props.onPrev} disabled={props.prevDisabled}>
          <Ionicons name="chevron-back" size={16} color={theme.colors.text} />
          <Text style={s.arrowTxt}>Prev</Text>
        </Pressable>

        <View style={s.centerMeta}>
          <Text style={s.centerTitle}>Ch. {props.idx} / {props.total}</Text>
          <Text style={s.centerSub}>{pctLabel}</Text>
        </View>

        <Pressable style={[s.arrowBtn, props.nextDisabled && s.disabled]} onPress={props.onNext} disabled={props.nextDisabled}>
          <Text style={s.arrowTxt}>Next</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Quick actions */}
      <View style={s.rowCard}>
        <Pressable style={s.actionBtn} onPress={props.onOpenContents}>
          <Ionicons name="list-outline" size={18} color={theme.colors.text} />
          <Text style={s.actionLabel}>Contents</Text>
        </Pressable>

        <Pressable style={s.actionBtn} onPress={props.onOpenAbout}>
          {/* Tiny cover placeholder square to mimic screenshot */}
          <View style={s.coverMini} />
          <Text style={s.actionLabel}>About this book</Text>
        </Pressable>
      </View>

      <View style={s.rowCard}>
        <Pressable style={s.actionBtn} onPress={() => {}}>
          <Ionicons name="create-outline" size={18} color={theme.colors.text} />
          <Text style={s.actionLabel}>Edit Terms</Text>
        </Pressable>

        <Pressable style={s.actionBtn} onPress={() => {}}>
          <Ionicons name="bookmark-outline" size={18} color={theme.colors.text} />
          <Text style={s.actionLabel}>Bookmark Chapter</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.bgElevated,
    borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    overflow: "hidden",
  },
  arrowBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  arrowTxt: { color: t.colors.text, fontWeight: "700" },
  disabled: { opacity: 0.4 },

  centerMeta: { flex: 1, alignItems: "center", paddingVertical: 6 },
  centerTitle: { color: t.colors.text, fontWeight: "800" },
  centerSub: { color: t.colors.textDim, fontSize: t.font.sm },

  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  actionLabel: { color: t.colors.text, fontWeight: "700" },
  coverMini: { width: 22, height: 22, borderRadius: 4, backgroundColor: "#333" },
}));
