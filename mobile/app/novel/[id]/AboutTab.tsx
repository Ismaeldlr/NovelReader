import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { createStyles, useTheme } from "../../../src/theme";
import type { NovelRow } from "../[id]";

type Props = { novel: NovelRow };

export default function AboutTab({ novel }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [expanded, setExpanded] = useState(false);
  const DESC_PREVIEW_LEN = 220;

  return (
    <View style={s.container}>
      {/* Description */}
      {novel.description ? (
        <View style={s.card}>
          <Text style={s.cardTitle}>Description</Text>
          <Text style={s.desc} numberOfLines={expanded ? undefined : 5}>
            {expanded || novel.description.length <= DESC_PREVIEW_LEN
              ? novel.description
              : novel.description.slice(0, DESC_PREVIEW_LEN) + "…"}
          </Text>
          {novel.description.length > DESC_PREVIEW_LEN && (
            <Pressable onPress={() => setExpanded(v => !v)}><Text style={s.showMore}>{expanded ? "Show less" : "Show more"}</Text></Pressable>
          )}
        </View>
      ) : null}

      {/* Info grid */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Details</Text>
        <View style={s.grid}>
          <Text style={s.kLabel}>Author:</Text><Text style={s.kVal}>{novel.author || "Unknown"}</Text>
          <Text style={s.kLabel}>Original Lang:</Text><Text style={s.kVal}>{novel.lang_original || "—"}</Text>
          <Text style={s.kLabel}>Status:</Text><Text style={s.kVal}>{novel.status || "—"}</Text>
          <Text style={s.kLabel}>Slug:</Text><Text style={s.kVal}>{novel.slug || "—"}</Text>
        </View>
      </View>

      {/* You can add Genres/Tags here when these exist in your DB */}
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  container: { marginTop: 12, gap: 12 },
  card: {
    backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, padding: 12,
  },
  cardTitle: { color: t.colors.text, fontWeight: "800", marginBottom: 8 },
  desc: { color: t.colors.textDim },
  showMore: { color: t.colors.tint, fontWeight: "600", marginTop: 8, fontSize: t.font.sm },
  grid: { marginTop: 6, columnGap: 8, rowGap: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  kLabel: { color: t.colors.textDim },
  kVal: { color: t.colors.text, fontWeight: "600", marginRight: 12 },
}));
