// app/Library.tsx (or screens/Library.tsx)
import { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, createStyles } from "../src/theme";
import { initDb } from "../src/db";
import AddNovelSheet from "./Components/AddNovelSheet";
import EditNovelSheet from "./Components/EditNovelSheet";

type NovelRow = { id: number; title: string; author: string | null; description?: string | null; cover_path?: string | null };

export default function Library() {
  const { theme } = useTheme();
  const s = styles(theme);
  const router = useRouter();

  const [novels, setNovels] = useState<NovelRow[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [addOpen, setAddOpen] = useState(false);
  const dbRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await initDb();
      if (!alive) return;
      dbRef.current = db;
      await reload();
    })().catch(e => setStatus("DB error: " + String(e)));
    return () => { alive = false; };
  }, []);

  async function reload() {
    const db = dbRef.current; if (!db) return;
    const rows = await db.select(
      `SELECT id, title, author, description, cover_path
         FROM novels
        ORDER BY updated_at DESC;`
    );
    setNovels(rows as NovelRow[]);
    setStatus("Ready");
  }

  async function removeNovel(id: number) {
    const db = dbRef.current; if (!db) return;
    await db.execute(`DELETE FROM novels WHERE id = ?`, [id]);
    await reload();
  }

  function normalizeCoverUri(p?: string | null) {
    if (!p) return null;
    if (/^(file|content|https?):|^data:/.test(p)) return p; // already a URI
    // bare relative/absolute path -> treat as local file
    return "file://" + p.replace(/^\/+/, "");
  }
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.h1}>Library</Text>
        <Text style={s.status}>{status}</Text>
      </View>

      {novels.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No novels yet</Text>
          <Text style={s.emptySub}>Tap the + button to add one.</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(it) => String(it.id)}
          contentContainerStyle={{ paddingBottom: 96, paddingHorizontal: theme.spacing(4) }}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing(2) }} />}
          renderItem={({ item }) => (
            <Pressable
              style={s.card}
              onPress={() => router.push({ pathname: "/novel/[id]", params: { id: String(item.id) } })}
              android_ripple={{ color: "#222" }}
            >
              <View style={s.cover}>
                {item.cover_path ? (
                  <Image
                    source={{ uri: normalizeCoverUri(item.cover_path) as string }}
                    style={s.coverImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={s.coverText}>{initials(item.title)}</Text>
                )}
              </View>
              <View style={s.meta}>
                <Text numberOfLines={1} style={s.title}>{item.title}</Text>
                <Text numberOfLines={1} style={s.author}>{item.author || "Unknown author"}</Text>
                {!!item.description && <Text numberOfLines={2} style={s.desc}>{item.description}</Text>}
              </View>
              <Pressable onPress={() => removeNovel(item.id)} onPressIn={(e) => e.stopPropagation()} style={s.menuBtn}>
                <Text style={s.menuText}>⋮</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Floating + button */}
      <Pressable style={s.fab} onPress={() => setAddOpen(true)}>
        <Text style={s.fabPlus}>＋</Text>
      </Pressable>

      <AddNovelSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => { setAddOpen(false); reload(); }}
      />
    </View>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}

const styles = createStyles((t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg },
  header: {
    paddingVertical: t.spacing(4),
    paddingHorizontal: t.spacing(4),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { color: t.colors.text, fontSize: t.font.xl, fontWeight: "800" },
  status: { color: t.colors.textDim },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: t.spacing(4) },
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
    width: 76, height: 112,
    borderRadius: t.radius.md,
    overflow: "hidden",                // so the image respects rounding
    backgroundColor: "#1b222c",
    alignItems: "center", justifyContent: "center",
  },
  coverImg: { width: "100%", height: "100%" },
  coverText: { color: "#c3c7d1", fontWeight: "800", fontSize: 16 },

  meta: { flex: 1 },
  title: { color: t.colors.text, fontSize: t.font.md, fontWeight: "700" },
  author: { color: t.colors.textDim, marginTop: 2 },
  desc: { color: t.colors.textDim, marginTop: 6, fontSize: t.font.sm },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  menuText: { color: t.colors.text, fontSize: 18 },

  fab: {
    position: "absolute",
    left: 16,
    bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: t.colors.tint,
    alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    elevation: 4,
  },
  fabPlus: { color: "#fff", fontSize: 25, lineHeight: 30, fontWeight: "800" },
}));
