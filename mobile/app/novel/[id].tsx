import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Modal, TouchableOpacity, Platform } from "react-native";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

type NovelRow = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  cover_path?: string | null;
  lang_original?: string | null;
  status?: string | null;
  slug?: string | null;
  created_at?: number;
  updated_at?: number;
};

type ChapterRow = {
  id: number;
  seq: number;
  volume: number | null;
  display_title: string | null;
  created_at: number;
  updated_at: number;
};

export default function NovelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const novelId = useMemo(() => Number(id), [id]);
  const router = useRouter();
  const { theme } = useTheme();
  const s = styles(theme);

  const [novel, setNovel] = useState<NovelRow | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [msg, setMsg] = useState("Loading…");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const dbRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await initDb();
      if (!alive) return;
      dbRef.current = db;
      await reloadAll();
    })().catch(e => setMsg("DB error: " + String(e)));
    return () => { alive = false; };
  }, [novelId]);

  async function reloadAll() {
    const db = dbRef.current;
    if (!db) return;
    const n = await db.select(
      `SELECT id, title, author, description, cover_path, lang_original, status, slug, created_at, updated_at
       FROM novels WHERE id = ?`,
      [novelId]
    );
    setNovel(n[0] ?? null);

    const ch = await db.select(
      `SELECT id, seq, volume, display_title, created_at, updated_at
       FROM chapters WHERE novel_id = ? ORDER BY seq ASC`,
      [novelId]
    );
    setChapters(ch as ChapterRow[]);
    setMsg("Ready");
  }

  function initials(title: string) {
    const words = title.trim().split(/\s+/).slice(0, 2);
    return words.map(w => w[0]?.toUpperCase() ?? "").join("");
  }

  async function removeNovel(nid: number) {
    const db = dbRef.current;
    if (!db) return;
    await db.execute(`DELETE FROM novels WHERE id = ?`, [nid]); // cascades
    router.back();
  }

  async function deleteChapter(cid: number) {
    const db = dbRef.current;
    if (!db) return;
    await db.execute(`DELETE FROM chapters WHERE id = ?`, [cid]); // cascades
    await reloadAll();
  }

  async function nextSeq(): Promise<number> {
    const db = dbRef.current; if (!db) return 1;
    const rows = await db.select(`SELECT IFNULL(MAX(seq),0) AS max_seq FROM chapters WHERE novel_id = ?`, [novelId]);
    return (rows[0]?.max_seq ?? 0) + 1;
  }

  async function onAddEmpty() {
    if (!novel) return;
    const db = dbRef.current; if (!db) return;
    const seq = await nextSeq();

    // Create chapter
    await db.execute(
      `INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?, ?, ?, ?)`,
      [novel.id, seq, null, null]
    );
    const cidRow = await db.select(`SELECT last_insert_rowid() AS id`);
    const chapterId = cidRow[0].id as number;

    // Minimal primary variant (required by NOT NULL content)
    await db.execute(
      `INSERT INTO chapter_variants
       (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chapterId,
        "original",
        novel.lang_original ?? "en",
        null,
        "", // empty content placeholder
        null, null, null,
        1,
      ]
    );

    setAddOpen(false);
    await reloadAll();
  }

  async function onImportTxt() {
    if (!novel) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/plain", "text/*", "*/*"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;

    const asset = res.assets[0];
    const uri = asset.uri;
    const name = asset.name ?? "Chapter";

    // Read file as string (UTF-8)
    const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });

    const db = dbRef.current; if (!db) return;
    const seq = await nextSeq();

    await db.execute(
      `INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?, ?, ?, ?)`,
      [novel.id, seq, null, stripExt(name)]
    );
    const cidRow = await db.select(`SELECT last_insert_rowid() AS id`);
    const chapterId = cidRow[0].id as number;

    await db.execute(
      `INSERT INTO chapter_variants
       (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chapterId,
        "original",
        novel.lang_original ?? "en",
        stripExt(name),
        content ?? "",
        null, null, null,
        1,
      ]
    );

    setAddOpen(false);
    await reloadAll();
  }

  function stripExt(n: string) {
    const i = n.lastIndexOf(".");
    return i > 0 ? n.slice(0, i) : n;
  }

  function onImportEpub() {
    // Placeholder: EPUB parsing on RN requires reading the EPUB (zip) and parsing content.
    // We can implement with JSZip + simple spine parsing in a follow-up.
    setAddOpen(false);
    setMsg("EPUB import: coming soon on mobile.");
  }

  return (
    <View style={s.page}>
      <View style={s.topbar}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Pressable onPress={() => setAddOpen(v => !v)} style={s.btn}>
            <Text style={s.btnText}>+ Add Chapter</Text>
          </Pressable>
          <Link href="/" asChild>
            <Pressable style={s.btnGhost}>
              <Text style={s.btnGhostText}>← Library</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {!novel ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Novel not found.</Text>
        </View>
      ) : (
        <>
          <View style={s.hero}>
            <View style={s.coverLg}>
              <Text style={s.coverText}>{initials(novel.title)}</Text>

              <View style={s.menuWrap}>
                <Pressable onPress={() => setMenuOpen(v => !v)} style={s.menuBtn} accessibilityRole="button">
                  <Text style={s.menuDot}>⋮</Text>
                </Pressable>
                {menuOpen && (
                  <View style={s.menu}>
                    {/* Edit modal could go here later */}
                    <Pressable style={s.menuItem} onPress={() => removeNovel(novel.id)}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.text} />
                      <Text style={s.menuLabel}>Remove from Library</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={s.meta}>
              <Text style={s.h2}>{novel.title}</Text>
              <Text style={s.author}>{novel.author || "Unknown author"}</Text>
              {novel.description ? <Text style={s.desc}>{novel.description}</Text> : null}
              <View style={s.kv}>
                <Text style={s.kLabel}>Original Lang:</Text><Text style={s.kVal}>{novel.lang_original || "—"}</Text>
                <Text style={s.kLabel}>Status:</Text><Text style={s.kVal}>{novel.status || "—"}</Text>
                <Text style={s.kLabel}>Slug:</Text><Text style={s.kVal}>{novel.slug || "—"}</Text>
              </View>
              <Text style={s.statusMsg}>{msg}</Text>
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={s.h3}>Chapters</Text>
            {chapters.length === 0 ? (
              <View style={s.emptySmall}>
                <Text style={s.emptySmallText}>No chapters yet.</Text>
                <Text style={s.emptySmallSub}>Use “Add Chapter” → Empty / TXT.</Text>
              </View>
            ) : (
              <FlatList
                data={chapters}
                keyExtractor={(c) => String(c.id)}
                contentContainerStyle={{ paddingBottom: 32 }}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <Pressable
                    style={s.chapterRow}
                    onPress={() => router.push({ pathname: "/novel/[id]/chapter/[chapterId]", params: { id: String(novelId), chapterId: String(item.id) } })}
                    android_ripple={{ color: '#222' }}
                  >
                    <View style={s.chip}><Text style={s.chipTxt}>#{item.seq}</Text></View>
                    <Text style={s.chTitle} numberOfLines={1}>
                      {item.display_title || `Chapter ${item.seq}`}
                    </Text>
                    <Pressable onPress={(e) => { e.stopPropagation(); deleteChapter(item.id); }} style={s.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.text} />
                    </Pressable>
                  </Pressable>
                )}
              />
            )}
          </View>
        </>
      )}

      {/* Add Chapter Menu (modal) */}
      <Modal transparent visible={addOpen} animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setAddOpen(false)}>
          <View />
        </Pressable>
        <View style={s.addMenu}>
          <Text style={s.addTitle}>Add Chapter</Text>
          <TouchableOpacity style={s.addItem} onPress={onAddEmpty}>
            <Ionicons name="document-outline" size={20} color={theme.colors.text} />
            <Text style={s.addLabel}>Empty</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addItem} onPress={onImportTxt}>
            <Ionicons name="document-text-outline" size={20} color={theme.colors.text} />
            <Text style={s.addLabel}>Import TXT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addItem} onPress={onImportEpub}>
            <Ionicons name="book-outline" size={20} color={theme.colors.text} />
            <Text style={s.addLabel}>Import EPUB (soon)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.addItem, { justifyContent: "center" }]} onPress={() => setAddOpen(false)}>
            <Text style={[s.addLabel, { color: theme.colors.textDim }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.colors.bg, padding: t.spacing(4)},
  topbar: { flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end", marginBottom: t.spacing(5), marginTop: t.spacing(10) },
  title: { color: t.colors.text, fontSize: t.font.xl, fontWeight: "800" },
  btn: { backgroundColor: t.colors.tint, paddingVertical: t.spacing(2), paddingHorizontal: t.spacing(3), borderRadius: t.radius.md },
  btnText: { color: "#fff", fontWeight: "700" },
  btnGhost: { paddingVertical: t.spacing(2), paddingHorizontal: t.spacing(3), borderRadius: t.radius.md },
  btnGhostText: { color: t.colors.textDim, fontWeight: "700" },

  hero: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  coverLg: {
    width: 96, height: 128, borderRadius: t.radius.lg, backgroundColor: "#1b222c",
    alignItems: "center", justifyContent: "center", position: "relative"
  },
  coverText: { color: "#c3c7d1", fontSize: 20, fontWeight: "800" },

  menuWrap: { position: "absolute", top: 6, right: 6 },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  menuDot: { color: t.colors.text, fontSize: 18 },
  menu: {
    position: "absolute", top: 28, right: 0, backgroundColor: t.colors.card,
    borderRadius: t.radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, overflow: "hidden"
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  menuLabel: { color: t.colors.text },

  meta: { flex: 1 },
  h2: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800" },
  author: { color: t.colors.textDim, marginTop: 4 },
  desc: { color: t.colors.textDim, marginTop: 8 },
  kv: {
    marginTop: 12, columnGap: 8, rowGap: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center"
  },
  kLabel: { color: t.colors.textDim },
  kVal: { color: t.colors.text, fontWeight: "600", marginRight: 12 },
  statusMsg: { color: t.colors.textDim, marginTop: 8, fontSize: t.font.sm },

  h3: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800", marginTop: 8, marginBottom: 6 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700" },
  emptySmall: {
    padding: 16, backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border
  },
  emptySmallText: { color: t.colors.text, fontWeight: "600" },
  emptySmallSub: { color: t.colors.textDim, marginTop: 4 },

  chapterRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
    padding: 12
  },
  chip: { backgroundColor: "rgba(127,127,127,0.18)", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, marginRight: 10 },
  chipTxt: { color: t.colors.text, fontWeight: "700" },
  chTitle: { flex: 1, color: t.colors.text },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 6 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  addMenu: {
    position: "absolute", left: 16, right: 16, bottom: 24,
    backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border,
    padding: 12,
  },
  addTitle: { color: t.colors.text, fontWeight: "800", fontSize: t.font.md, marginBottom: 8 },
  addItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6 },
  addLabel: { color: t.colors.text, fontWeight: "600" },
}));
