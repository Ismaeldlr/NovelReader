import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, TouchableOpacity, Image, ScrollView, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import AddChaptersEPUB from "../Components/AddChaptersEPUB";
import EditNovelSheet from "../Components/EditNovelSheet";

// ---- Types ----
export type NovelRow = {
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
export type ChapterRow = {
  id: number;
  seq: number;
  volume: number | null;
  display_title: string | null;
  created_at: number;
  updated_at: number;
};

// ---- Helpers ----
function normalizeCoverUri(p?: string | null): string | null {
  if (!p) return null;
  if (/^(file|content|https?):|^data:/.test(p)) return p;
  return "file://" + p.replace(/^\/+/, "");
}

// Tabs
type TabKey = "about" | "toc";

// Lazy tab components
import AboutTab from "./[id]/AboutTab";
import TableOfContentsTab from "./[id]/TableOfContentsTab";

export default function NovelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const novelId = useMemo(() => Number(id), [id]);
  const router = useRouter();
  const { theme } = useTheme();
  const s = styles(theme);

  // Page state
  const [activeTab, setActiveTab] = useState<TabKey>("about");
  const [novel, setNovel] = useState<NovelRow | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [msg, setMsg] = useState("Loading…");

  // Menus / modals
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchorY, setMenuAnchorY] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<{ open: boolean; chapterId: number | null }>({ open: false, chapterId: null });
  const [confirmDelNovel, setConfirmDelNovel] = useState(false);

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
    await db.execute(`DELETE FROM chapters WHERE id = ?`, [cid]);
    await reloadAll();
  }

  function askDeleteChapter(cid: number) {
    setConfirmDel({ open: true, chapterId: cid });
  }
  async function confirmDeleteChapter() {
    if (confirmDel.chapterId != null) {
      await deleteChapter(confirmDel.chapterId);
    }
    setConfirmDel({ open: false, chapterId: null });
  }
  function cancelDeleteChapter() {
    setConfirmDel({ open: false, chapterId: null });
  }

  function askDeleteNovel() { setConfirmDelNovel(true); }
  async function confirmDeleteNovel() {
    setConfirmDelNovel(false);
    if (novel) await removeNovel(novel.id);
  }
  function cancelDeleteNovel() { setConfirmDelNovel(false); }

  async function nextSeq(): Promise<number> {
    const db = dbRef.current; if (!db) return 1;
    const rows = await db.select(`SELECT IFNULL(MAX(seq),0) AS max_seq FROM chapters WHERE novel_id = ?`, [novelId]);
    return (rows[0]?.max_seq ?? 0) + 1;
  }

  async function onAddEmpty() {
    if (!novel) return;
    const db = dbRef.current; if (!db) return;
    const seq = await nextSeq();
    await db.execute(
      `INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?, ?, ?, ?)`,
      [novel.id, seq, null, null]
    );
    const cidRow = await db.select(`SELECT last_insert_rowid() AS id`);
    const chapterId = cidRow[0].id as number;
    await db.execute(
      `INSERT INTO chapter_variants
       (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chapterId, "original", novel.lang_original ?? "en", null, "", null, null, null, 1]
    );
    setAddOpen(false);
    await reloadAll();
  }

  async function onImportTxt() {
    if (!novel) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/plain", "text/*", "*/*"], multiple: false, copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;

    const asset = res.assets[0];
    const uri = asset.uri;
    const name = asset.name ?? "Chapter";
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
      [chapterId, "original", novel.lang_original ?? "en", stripExt(name), content ?? "", null, null, null, 1]
    );
    setAddOpen(false);
    await reloadAll();
  }

  function stripExt(n: string) {
    const i = n.lastIndexOf(".");
    return i > 0 ? n.slice(0, i) : n;
  }

  const firstChapterId = chapters[0]?.id;

  // Floating menu placement
  const scrH = Dimensions.get("window").height;
  const menuTop = Math.max(72, Math.min(((menuAnchorY ?? 140) - 10), scrH - 160));

  return (
    <View style={s.page}>
      {/* Top bar */}
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
        <View style={s.empty}><Text style={s.emptyTitle}>Novel not found.</Text></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {/* HERO (cover + meta + action) */}
            <View style={s.hero}>
              <View style={s.coverBox}>
                {novel.cover_path ? (
                  <Image source={{ uri: normalizeCoverUri(novel.cover_path) as string }} style={s.coverLg} resizeMode="cover" />
                ) : (
                  <View style={s.coverLg}><Text style={s.coverText}>{initials(novel.title)}</Text></View>
                )}

                {/* Overlay menu button */}
                <View style={s.overlayBtns}>
                  <Pressable
                    style={s.iconBtn}
                    onPress={(e: any) => {
                      setMenuOpen(true);
                      setMenuAnchorY(e?.nativeEvent?.pageY ?? null);
                    }}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>

              <View style={s.meta}>
                <Text style={s.h2}>{novel.title}</Text>
                <Text style={s.author}>{novel.author || "Unknown author"}</Text>

                {/* Chips row: status + language */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <View style={s.smallChip}><Text style={s.smallChipTxt}>{novel.status || "—"}</Text></View>
                  <View style={s.smallChip}><Text style={s.smallChipTxt}>{novel.lang_original || "—"}</Text></View>
                </View>

                {/* Start / Continue button */}
                <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={[s.btn, { paddingHorizontal: 16 }]}
                    disabled={!firstChapterId}
                    onPress={() => {
                      if (!firstChapterId) return;
                      router.push({
                        pathname: "/novel/[id]/chapter/[chapterId]",
                        params: { id: String(novelId), chapterId: String(firstChapterId) }
                      });
                    }}
                  >
                    <Text style={s.btnText}>
                      {firstChapterId ? "Start reading" : "Start reading"}
                    </Text>
                  </Pressable>
                </View>

                <Text style={s.statusMsg}>{msg}</Text>
              </View>
            </View>

            {/* TABS */}
            <View style={{ marginTop: 18 }}>
              <View style={s.tabsRow}>
                <Pressable
                  onPress={() => setActiveTab("about")}
                  style={[s.tabBtn, activeTab === "about" && s.tabBtnActive]}
                >
                  <Text style={[s.tabTxt, activeTab === "about" && s.tabTxtActive]}>About</Text>
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("toc")}
                  style={[s.tabBtn, activeTab === "toc" && s.tabBtnActive]}
                >
                  <Text style={[s.tabTxt, activeTab === "toc" && s.tabTxtActive]}>Table of Contents</Text>
                </Pressable>
              </View>

              {activeTab === "about" ? (
                <AboutTab novel={novel} />
              ) : (
                <TableOfContentsTab
                  novelId={novelId}
                  chapters={chapters}
                  onOpenChapter={(chapterId) =>
                    router.push({
                      pathname: "/novel/[id]/chapter/[chapterId]",
                      params: { id: String(novelId), chapterId: String(chapterId) },
                    })
                  }
                  onAskDeleteChapter={askDeleteChapter}
                />
              )}
            </View>
          </ScrollView>

          {/* Floating dropdown menu in a top-level Modal */}
          <Modal
            transparent
            visible={menuOpen}
            animationType="fade"
            onRequestClose={() => setMenuOpen(false)}
          >
            <Pressable style={s.modalBackdrop} onPress={() => setMenuOpen(false)} />
            <View style={[s.floatMenu, { top: menuTop }]}>
              <Pressable
                style={s.menuItem}
                onPress={() => { setMenuOpen(false); setEditOpen(true); }}
              >
                <Ionicons name="create-outline" size={18} color={theme.colors.text} />
                <Text style={s.menuLabel}>Edit novel</Text>
              </Pressable>
              <Pressable
                style={s.menuItem}
                onPress={() => { setMenuOpen(false); askDeleteNovel(); }}
              >
                <Ionicons name="trash-outline" size={18} color={theme.colors.text} />
                <Text style={s.menuLabel}>Remove from Library</Text>
              </Pressable>
            </View>
          </Modal>
        </>
      )}

      {/* Add Chapter Menu */}
      <Modal transparent visible={addOpen} animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setAddOpen(false)} />
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
          <TouchableOpacity
            style={s.addItem}
            onPress={() => { setAddOpen(false); setImportOpen(true); }}
          >
            <Ionicons name="book-outline" size={20} color={theme.colors.text} />
            <Text style={s.addLabel}>Import EPUB</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.addItem, { justifyContent: "center" }]} onPress={() => setAddOpen(false)}>
            <Text style={[s.addLabel, { color: theme.colors.textDim }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* EPUB importer sheet */}
      <AddChaptersEPUB
        visible={importOpen}
        novelId={novelId}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); reloadAll(); }}
      />

      {/* Edit sheet */}
      <EditNovelSheet
        visible={editOpen}
        novelId={novelId}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); reloadAll(); }}
      />

      {/* Confirm delete novel */}
      <Modal transparent visible={confirmDelNovel} animationType="fade" onRequestClose={cancelDeleteNovel}>
        <Pressable style={s.modalBackdrop} onPress={cancelDeleteNovel} />
        <View style={s.centerWrap}>
          <View style={s.confirmCard}>
            <Text style={s.confirmText}>Are you sure you want to delete this novel?</Text>
            <View style={s.confirmActions}>
              <Pressable style={s.btnGhost} onPress={cancelDeleteNovel}><Text style={s.btnGhostText}>No</Text></Pressable>
              <View style={{ flex: 1 }} />
              <Pressable style={s.btn} onPress={confirmDeleteNovel}><Text style={s.btnText}>Yes</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm delete chapter */}
      <Modal transparent visible={confirmDel.open} animationType="fade" onRequestClose={cancelDeleteChapter}>
        <Pressable style={s.modalBackdrop} onPress={cancelDeleteChapter} />
        <View style={s.centerWrap}>
          <View style={s.confirmCard}>
            <Text style={s.confirmText}>Are you sure you want to delete the chapter?</Text>
            <View style={s.confirmActions}>
              <Pressable style={s.btnGhost} onPress={cancelDeleteChapter}><Text style={s.btnGhostText}>No</Text></Pressable>
              <View style={{ flex: 1 }} />
              <Pressable style={s.btn} onPress={confirmDeleteChapter}><Text style={s.btnText}>Yes</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.colors.bg, padding: t.spacing(4), position: 'relative' },
  topbar: { flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-end", marginBottom: t.spacing(5), marginTop: t.spacing(10) },

  btn: { backgroundColor: t.colors.tint, paddingVertical: t.spacing(2), paddingHorizontal: t.spacing(3), borderRadius: t.radius.md },
  btnText: { color: "#fff", fontWeight: "700" },
  btnGhost: { paddingVertical: t.spacing(2), paddingHorizontal: t.spacing(3), borderRadius: t.radius.md },
  btnGhostText: { color: t.colors.textDim, fontWeight: "700" },

  hero: { flexDirection: "row", gap: 16, alignItems: "flex-start" },

  coverBox: { width: 120, height: 180, position: "relative" },
  coverLg: { width: "100%", height: "100%", borderRadius: t.radius.lg, backgroundColor: "#1b222c", alignItems: "center", justifyContent: "center" },
  coverText: { color: "#c3c7d1", fontSize: 20, fontWeight: "800" },

  overlayBtns: { position: "absolute", top: 6, right: 6, flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.25)",
  },

  // Floating menu (Modal)
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  floatMenu: {
    position: "absolute",
    left: 106,
    top: 140,
    backgroundColor: t.colors.card,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  menuLabel: { color: t.colors.text },

  meta: { flex: 1 },
  h2: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800" },
  author: { color: t.colors.textDim, marginTop: 4 },
  statusMsg: { color: t.colors.textDim, marginTop: 8, fontSize: t.font.sm },

  // tiny chips under title
  smallChip: { backgroundColor: "rgba(127,127,127,0.18)", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  smallChipTxt: { color: t.colors.text, fontWeight: "700", fontSize: t.font.sm },

  // Tabs
  tabsRow: {
    flexDirection: "row", backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, padding: 4, gap: 6,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: t.radius.md },
  tabBtnActive: { backgroundColor: t.colors.bgElevated },
  tabTxt: { color: t.colors.textDim, fontWeight: "700" },
  tabTxtActive: { color: t.colors.text },

  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "700" },

  // Add sheet
  addMenu: {
    position: "absolute", left: 16, right: 16, bottom: 0, backgroundColor: t.colors.card, borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, padding: 12,
  },
  addTitle: { color: t.colors.text, fontWeight: "800", fontSize: t.font.md, marginBottom: 8 },
  addItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6 },
  addLabel: { color: t.colors.text, fontWeight: "600" },

  // Confirm dialog
  centerWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  confirmCard: {
    width: "84%", backgroundColor: t.colors.card, borderRadius: t.radius.lg, borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border, padding: 16,
  },
  confirmText: { color: t.colors.text, fontWeight: "700", marginBottom: 12 },
  confirmActions: { flexDirection: "row", alignItems: "center" },
}));
