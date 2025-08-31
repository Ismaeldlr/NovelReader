// app/library.tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useTheme, createStyles } from "../src/theme";
import { initDb } from "../src/db";

type NovelRow = {
  id: number; title: string; author: string | null; description: string | null; cover_path?: string | null;
};

export default function Library() {
  const { theme } = useTheme();
  const s = styles(theme);
  const [novels, setNovels] = useState<NovelRow[]>([]);
  const [msg, setMsg] = useState("Loading…");
  const dbRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await initDb();
      if (!alive) return;
      dbRef.current = db;
      const rows = await db.select(
        `SELECT id, title, author, description, cover_path FROM novels ORDER BY updated_at DESC`
      );
      setNovels(rows as NovelRow[]);
      setMsg("Ready");
    })().catch(e => setMsg("DB error: " + String(e)));
    return () => { alive = false; };
  }, []);

  async function removeNovel(id: number) {
    const db = dbRef.current;
    if (!db) return;
    await db.execute(`DELETE FROM novels WHERE id = ?`, [id]);
    const rows = await db.select(
      `SELECT id, title, author, description, cover_path FROM novels ORDER BY updated_at DESC`
    );
    setNovels(rows as NovelRow[]);
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.h1}>Library</Text>
        <Text style={s.status}>{msg}</Text>
      </View>

      {novels.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No novels yet</Text>
          <Text style={s.emptySub}>Add one from desktop or future imports.</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cover}><Text style={s.coverText}>{initials(item.title)}</Text></View>
              <View style={s.meta}>
                <Text numberOfLines={1} style={s.title}>{item.title}</Text>
                <Text numberOfLines={1} style={s.author}>{item.author || "Unknown author"}</Text>
                {item.description ? <Text numberOfLines={2} style={s.desc}>{item.description}</Text> : null}
              </View>
              <Pressable onPress={() => removeNovel(item.id)} style={s.menuBtn}>
                <Text style={s.menuText}>⋮</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}

const styles = createStyles((t) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingVertical: t.spacing(2),
    paddingHorizontal: t.spacing(1),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { color: t.colors.text, fontSize: t.font.xl, fontWeight: "800" },
  status: { color: t.colors.textDim },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700", marginBottom: 6 },
  emptySub: { color: t.colors.textDim },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderRadius: t.radius.lg,
    padding: t.spacing(3),
    gap: t.spacing(3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  cover: {
    width: 56, height: 56, borderRadius: t.radius.md,
    backgroundColor: "#1b222c", alignItems: "center", justifyContent: "center",
  },
  coverText: { color: "#c3c7d1", fontWeight: "800", fontSize: 16 },
  meta: { flex: 1 },
  title: { color: t.colors.text, fontSize: t.font.md, fontWeight: "700" },
  author: { color: t.colors.textDim, marginTop: 2 },
  desc: { color: t.colors.textDim, marginTop: 6, fontSize: t.font.sm },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  menuText: { color: t.colors.text, fontSize: 18 },
}));
