import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createStyles, useTheme } from "../../../src/theme";
import type { ChapterRow } from "../[id]";

type Props = {
  novelId: number;
  chapters: ChapterRow[];
  onOpenChapter: (chapterId: number) => void;
  onAskDeleteChapter: (chapterId: number) => void;
};

type Group = {
  key: string;
  start: number;
  end: number;
  items: ChapterRow[];
};

export default function TableOfContentsTab({ chapters, onOpenChapter, onAskDeleteChapter }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups: Group[] = useMemo(() => {
    // Group by 100s using 'seq'
    const byKey = new Map<string, Group>();
    for (const c of chapters) {
      const start = Math.floor((Math.max(1, c.seq) - 1) / 100) * 100 + 1;
      const end = start + 99;
      const key = `${start}-${end}`;
      if (!byKey.has(key)) byKey.set(key, { key, start, end, items: [] });
      byKey.get(key)!.items.push(c);
    }
    // Sort groups by start asc and chapters by seq asc
    const arr = Array.from(byKey.values()).sort((a, b) => a.start - b.start);
    arr.forEach(g => g.items.sort((a, b) => a.seq - b.seq));
    return arr;
  }, [chapters]);

  if (chapters.length === 0) {
    return (
      <View style={s.emptyCard}>
        <Text style={s.emptyTxt}>No chapters yet.</Text>
        <Text style={s.emptySub}>Use “Add Chapter” → Empty / TXT / EPUB.</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 12 }}>
      {groups.map(g => {
        const isOpen = open.has(g.key);
        return (
          <View key={g.key} style={s.groupCard}>
            <Pressable
              onPress={() => {
                const next = new Set(open);
                if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                setOpen(next);
              }}
              style={s.groupHeader}
              android_ripple={{ color: "#222" }}
            >
              <Text style={s.groupTitle}>Chapters {g.start} - {g.end}</Text>
              <View style={{ flex: 1 }} />
              <Text style={s.groupCount}>{g.items.length}</Text>
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.text} />
            </Pressable>

            {isOpen && (
              <View style={{ paddingHorizontal: 8, paddingBottom: 10 }}>
                {g.items.map((item, idx) => (
                  <View key={item.id} style={{ marginTop: idx === 0 ? 0 : 8 }}>
                    <Pressable
                      style={s.chapterRow}
                      onPress={() => onOpenChapter(item.id)}
                      android_ripple={{ color: "#222" }}
                    >
                      <View style={s.chip}><Text style={s.chipTxt}>#{item.seq}</Text></View>
                      <Text style={s.chTitle} numberOfLines={1}>
                        {item.display_title || `Chapter ${item.seq}`}
                      </Text>
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); onAskDeleteChapter(item.id); }}
                        style={s.deleteBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.text} />
                      </Pressable>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

          </View>
        );
      })}
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  emptyCard: {
    padding: 16, backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
  },
  emptyTxt: { color: t.colors.text, fontWeight: "600" },
  emptySub: { color: t.colors.textDim, marginTop: 4 },

  groupCard: {
    backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
    overflow: "hidden", marginBottom: 10,
  },
  groupHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12 },
  groupTitle: { color: t.colors.text, fontWeight: "800" },
  groupCount: { color: t.colors.textDim, marginRight: 6 },

  chapterRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: t.colors.bg, borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, padding: 12,
  },
  chip: { backgroundColor: "rgba(127,127,127,0.18)", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, marginRight: 10 },
  chipTxt: { color: t.colors.text, fontWeight: "700" },
  chTitle: { flex: 1, color: t.colors.text },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 6 },
}));
