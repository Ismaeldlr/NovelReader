import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme, createStyles } from "../src/theme";
import { initDb } from "../src/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";

type NovelRow = {
  id: number; title: string; author: string | null; description: string | null; cover_path?: string | null;
};

export default function Library() {
  const { theme } = useTheme();
  const s = styles(theme);
  const [novels, setNovels] = useState<NovelRow[]>([]);
  const [msg, setMsg] = useState("Loading…");
  const dbRef = useRef<any>(null);
  const router = useRouter();

  // add-novel modal state
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"form" | "epub">("form");

  // form fields
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = title.trim().length > 0 && !saving;

  // epub import state
  const [busy, setBusy] = useState(false);
  const [epubMsg, setEpubMsg] = useState("Pick an EPUB to import.");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await initDb();
      if (!alive) return;
      dbRef.current = db;
      await reload();
    })().catch(e => setMsg("DB error: " + String(e)));
    return () => { alive = false; };
  }, []);

  async function reload() {
    const db = dbRef.current; if (!db) return;
    const rows = await db.select(
      `SELECT id, title, author, description, cover_path
       FROM novels
       ORDER BY updated_at DESC`
    );
    setNovels(rows as NovelRow[]);
    setMsg("Ready");
  }

  async function removeNovel(id: number) {
    const db = dbRef.current;
    if (!db) return;
    await db.execute(`DELETE FROM novels WHERE id = ?`, [id]);
    await reload();
  }

  async function onAddNovel() {
    if (!canSave) return;
    setSaving(true);
    try {
      const db = dbRef.current; if (!db) return;
      await db.execute(
        `INSERT INTO novels (title, author, description)
         VALUES (?, ?, ?)`,
        [title.trim(), author.trim() || null, description.trim() || null]
      );
      setAddOpen(false);
      setTitle(""); setAuthor(""); setDescription("");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  function openAddModal() {
    setMode("form");
    setErr(null);
    setPct(0);
    setEpubMsg("Pick an EPUB to import.");
    setAddOpen(true);
  }

  // ------------------- EPUB IMPORT FLOW -------------------
  async function onPickEpub() {
    setErr(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/epub+zip", "application/zip", ".epub"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    await importEpubFromUri(res.assets[0].uri);
  }

  async function importEpubFromUri(uri: string) {
    const db = dbRef.current; if (!db) return;
    setBusy(true);
    setPct(0);
    try {
      setEpubMsg("Reading EPUB…");

      // Read file as base64 → JSZip
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(b64, { base64: true });

      // ---- 1) container.xml → OPF path
      const container = await readZipText(zip, "META-INF/container.xml");
      if (!container) throw new Error("Invalid EPUB: missing META-INF/container.xml");

      const rootfile = attrMatch(container, /\bfull-path="([^"]+)"/i);
      if (!rootfile) throw new Error("Invalid EPUB: missing rootfile path");

      // ---- 2) read OPF
      const opfText = await readZipText(zip, rootfile);
      if (!opfText) throw new Error("Invalid EPUB: OPF not found");

      // paths
      const basePath = rootfile.split("/").slice(0, -1).join("/");
      const joinPath = (a: string, b: string) => {
        const clean = (x: string) => x.replace(/^\/+/, "");
        if (!a) return clean(b);
        if (b.startsWith("/")) return clean(b);
        const stack = a.split("/").filter(Boolean);
        const parts = b.split("/");
        for (const p of parts) {
          if (!p || p === ".") continue;
          if (p === "..") stack.pop();
          else stack.push(p);
        }
        return stack.join("/");
      };
      const resolveHref = (href: string) => joinPath(basePath, decodeURI(href));

      // ---- 3) parse manifest & spine (NO matchAll → Hermes-safe)
      const itemTags = findAll(opfText, /<item\b[^>]*>/ig);
      const manifestItems = itemTags.map(tag => {
        const id = attrMatch(tag, /\bid="([^"]+)"/i);
        const href = attrMatch(tag, /\bhref="([^"]+)"/i);
        const type = attrMatch(tag, /\bmedia-type="([^"]+)"/i) || "";
        const props = attrMatch(tag, /\bproperties="([^"]*)"/i) || "";
        return (id && href) ? { id, href, type, props } : null;
      }).filter(Boolean) as { id: string; href: string; type: string; props: string }[];

      const idToItem = new Map(manifestItems.map(it => [it.id, it]));
      const spineIds = findAll(opfText, /<itemref\b[^>]*idref="([^"]+)"/ig).map(m => {
        const mm = /idref="([^"]+)"/i.exec(m);
        return mm ? mm[1] : "";
      }).filter(Boolean);

      // prefer spine → html docs
      let htmlItems = spineIds
        .map(id => idToItem.get(id))
        .filter(Boolean)
        .filter((it: any) => {
          const isNav = /\bnav\b/i.test(it.props);
          const isNcx = /application\/x-dtbncx\+xml/i.test(it.type);
          const isHtml = /x?html/i.test(it.type) || /\.x?html?$/i.test(it.href);
          return !isNav && !isNcx && isHtml;
        }) as { id: string; href: string; type: string; props: string }[];

      // ---- 3a) Fallback #1: parse NCX if spine gave zero HTML
      if (htmlItems.length === 0) {
        const ncxItem = manifestItems.find(it => /x-dtbncx\+xml/i.test(it.type));
        if (ncxItem) {
          const ncx = await readZipText(zip, resolveHref(ncxItem.href));
          if (ncx) {
            const srcs = findAll(ncx, /<content\b[^>]*src="([^"]+)"/ig).map(t => {
              const m = /src="([^"]+)"/i.exec(t);
              return m ? m[1] : "";
            }).filter(Boolean);
            const seen = new Set<string>();
            const ordered = srcs
              .map(href => {
                const clean = href.split("#")[0];
                const mi = manifestItems.find(it => it.href.replace(/^\.\//, "") === clean.replace(/^\.\//, ""));
                return mi ?? { id: clean, href: clean, type: "", props: "" };
              })
              .filter(it => {
                const key = it.href.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return /\.x?html?$/i.test(it.href);
              });
            htmlItems = ordered as any;
          }
        }
      }

      // ---- 3b) Fallback #2: scan ZIP entries for .(x)html under OPF
      if (htmlItems.length === 0) {
        const all = Object.keys((zip as any).files || {});
        const base = basePath ? basePath + "/" : "";
        const candidates = all
          .filter(p => p.toLowerCase().startsWith(base.toLowerCase()))
          .filter(p => /\.x?html?$/i.test(p))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        htmlItems = candidates.map(href => ({
          id: href,
          href: href.replace(base, ""),
          type: "application/xhtml+xml",
          props: ""
        })) as any;
      }

      if (htmlItems.length === 0) throw new Error("No readable chapters found in EPUB.");


      // --- Only extract title and author, ignore description ---
      function textFromXmlTag(xml: string, tag: RegExp) {
        const m = tag.exec(xml);
        return m ? m[1].trim() : "";
      }

      const metaBlock = /<metadata[\s\S]*?<\/metadata>/i.exec(opfText)?.[0] ?? "";
      const opfTitle = textFromXmlTag(metaBlock, /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      const opfCreator = textFromXmlTag(metaBlock, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);

      const notCover = (it: { id: string; href: string }) =>
        !/cover|title[-_ ]?page/i.test(it.id) && !/cover|title[-_ ]?page/i.test(it.href);

      let novelTitle = (title ?? "").trim() || opfTitle || "Imported EPUB";
      let novelAuthor = (author ?? "").trim() || opfCreator || null;
      let novelDescription = null;

      setEpubMsg("Ensuring novel…");
      await db.execute(
        `INSERT INTO novels (title, author, description) VALUES (?, ?, ?)`,
        [novelTitle, novelAuthor, novelDescription]
      );
      const row = await db.select(`SELECT last_insert_rowid() AS id`);
      const novelId = row[0].id as number;

      // ---- 6) import chapters (skip only accepted meta pages)
      setEpubMsg("Importing chapters…");

      const lang = "en";
      const seqRow = await db.select(
        "SELECT IFNULL(MAX(seq), 0) as m FROM chapters WHERE novel_id = ?",
        [novelId]
      );
      let seq = (seqRow[0]?.m ?? 0) + 1;


  // Only skip cover/title pages, import all others as chapters
  const chapterItems = htmlItems.filter(notCover);

      let processed = 0;
      for (const item of chapterItems) {
        const path = resolveHref(item.href);
        const html = await readZipText(zip, path);
        if (!html) {
          processed++;
          setPct(Math.round((processed / Math.max(1, chapterItems.length)) * 100));
          continue;
        }

        const displayTitle = extractTitle(html) || `Chapter ${seq}`;
        const text = htmlToPlainText(html);

        const t = (displayTitle || "").toLowerCase();
        const badTitle = /(table of contents|contents|toc|copyright|title page)/i.test(t);
        const tooShort = text.replace(/\s+/g, " ").trim().length < 60;
        if (badTitle || tooShort) {
          processed++;
          setPct(Math.round((processed / Math.max(1, chapterItems.length)) * 100));
          continue;
        }

        await db.execute(
          "INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?,?,?,?)",
          [novelId, seq, null, displayTitle]
        );
        const chRow = await db.select(
          "SELECT id FROM chapters WHERE novel_id = ? AND seq = ? LIMIT 1",
          [novelId, seq]
        );
        const chId = chRow[0]?.id as number;

        await db.execute(
          "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
          [chId, "RAW", lang, displayTitle, text, null, "epub", null, 0]
        );

        seq++;
        processed++;
        setPct(Math.round((processed / Math.max(1, chapterItems.length)) * 100));
      }

      setEpubMsg(`Imported ${processed} chapter(s).`);
      setPct(100);
      setTitle(""); setAuthor(""); setDescription("");
      setAddOpen(false);
      await reload();
    } catch (e: any) {
      setErr(e?.message || String(e));
      setEpubMsg("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---- helpers for epub parsing without DOM ----
  function findAll(s: string, re: RegExp): string[] {
    const out: string[] = [];
    const r = new RegExp(re.source, re.flags.replace("g", "") + "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(s)) !== null) {
      out.push(m[0]);
      if (m.index === r.lastIndex) r.lastIndex++;
    }
    return out;
  }
  function attrMatch(s: string, re: RegExp) {
    const m = s.match(re);
    return m ? m[1] : null;
  }
  async function readZipText(zip: JSZip, path: string): Promise<string | null> {
    const file = zip.file(path) || zip.file(path.replace(/^\/+/, ""));
    if (!file) return null;
    return await (file as any).async("text");
  }
  function extractTitle(html: string): string | null {
    const h = html.replace(/\n+/g, " ");
    const h1 = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const h2 = h1 ? null : h.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
    const h3 = h1 || h2 ? null : h.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
    const tit = h1 ?? h2 ?? h3 ?? h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return tit ? decodeEntities(stripTags(tit).trim()) : null;
  }
  function htmlToPlainText(html: string): string {
    let s = html;
    s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
    s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|h\d|li|section|article|blockquote)>/gi, "$&\n\n");
    s = stripTags(s);
    s = decodeEntities(s);
    s = s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return s;
  }
  function stripTags(s: string) { return s.replace(/<[^>]+>/g, ""); }
  function decodeEntities(s: string) {
    const map: Record<string, string> = {
      "&nbsp;": " ",
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": "\"",
      "&#39;": "'",
      "&apos;": "'",
      "&#160;": " ",
    };
    return s.replace(/&[a-zA-Z#0-9]+;/g, m => map[m] ?? m);
  }

  // --------------------------------------------------------

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.h1}>Library</Text>
        <Text style={s.status}>{msg}</Text>
      </View>

      {novels.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No novels yet</Text>
          <Text style={s.emptySub}>Tap the + button to add one.</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 96 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Pressable
              style={s.card}
              onPress={() => router.push({ pathname: "/novel/[id]", params: { id: String(item.id) } })}
              android_ripple={{ color: "#222" }}
            >
              <View style={s.cover}><Text style={s.coverText}>{initials(item.title)}</Text></View>
              <View style={s.meta}>
                <Text numberOfLines={1} style={s.title}>{item.title}</Text>
                <Text numberOfLines={1} style={s.author}>{item.author || "Unknown author"}</Text>
                {item.description ? <Text numberOfLines={2} style={s.desc}>{item.description}</Text> : null}
              </View>
              <Pressable
                onPress={() => removeNovel(item.id)}
                style={s.menuBtn}
                onPressIn={(e) => e.stopPropagation()}
              >
                <Text style={s.menuText}>⋮</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Floating + button (bottom-left) */}
      <Pressable style={s.fab} onPress={openAddModal}>
        <Text style={s.fabPlus}>＋</Text>
      </Pressable>

      {/* Add / Import Modal */}
      <Modal transparent visible={addOpen} animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setAddOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.sheetWrap}
        >
          <View style={s.sheet}>
            {mode === "form" ? (
              <>
                <Text style={s.sheetTitle}>Add Novel</Text>

                <View style={s.field}>
                  <Text style={s.label}>Title *</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Required"
                    placeholderTextColor={theme.colors.textDim}
                    value={title}
                    onChangeText={setTitle}
                  />
                </View>

                <View style={s.field}>
                  <Text style={s.label}>Author</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Optional"
                    placeholderTextColor={theme.colors.textDim}
                    value={author}
                    onChangeText={setAuthor}
                  />
                </View>

                <View style={s.field}>
                  <Text style={s.label}>Description</Text>
                  <TextInput
                    style={[s.input, { height: 96, textAlignVertical: "top" }]}
                    multiline
                    placeholder="Optional"
                    placeholderTextColor={theme.colors.textDim}
                    value={description}
                    onChangeText={setDescription}
                  />
                </View>

                <View style={s.actions}>
                  <Pressable onPress={() => { setMode("epub"); setErr(null); setPct(0); setEpubMsg("Pick an EPUB to import."); }}>
                    <Text style={s.linkSmall}>Import EPUB</Text>
                  </Pressable>

                  <View style={{ flex: 1 }} />

                  <Pressable style={s.btnGhost} onPress={() => setAddOpen(false)}>
                    <Text style={s.btnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable disabled={!canSave} onPress={onAddNovel} style={[s.btn, !canSave && { opacity: 0.6 }]}>
                    <Text style={s.btnText}>{saving ? "Saving…" : "Add"}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={s.sheetTitle}>Import EPUB</Text>
                <Text style={s.dim}>{epubMsg}</Text>

                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${pct}%` }]} />
                </View>

                {err ? <Text style={s.err}>{err}</Text> : null}

                <View style={s.actions}>
                  <Pressable onPress={() => setMode("form")}>
                    <Text style={s.linkSmall}>← Back to form</Text>
                  </Pressable>

                  <View style={{ flex: 1 }} />

                  <Pressable style={s.btnGhost} onPress={() => setAddOpen(false)}>
                    <Text style={s.btnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={onPickEpub} style={[s.btn, busy && { opacity: 0.6 }]}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Select EPUB…</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingVertical: t.spacing(4),
    paddingHorizontal: t.spacing(1),
    paddingBottom: t.spacing(6),
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
    marginBottom: t.spacing(2),
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

  // FAB
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

  // Modal
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    padding: t.spacing(4),
    gap: t.spacing(2),
  },
  sheetTitle: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800", marginBottom: 4 },
  field: { gap: 6 },
  label: { color: t.colors.textDim, fontSize: t.font.sm },
  input: {
    backgroundColor: t.colors.bg,
    color: t.colors.text,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },

  // Buttons
  btn: { backgroundColor: t.colors.tint, paddingVertical: 10, paddingHorizontal: 16, borderRadius: t.radius.md },
  btnText: { color: "#fff", fontWeight: "700" },
  btnGhost: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: t.radius.md },
  btnGhostText: { color: t.colors.textDim, fontWeight: "700" },

  // EPUB UI
  linkSmall: { color: t.colors.tint, fontWeight: "700" },
  dim: { color: t.colors.textDim },
  progressTrack: {
    height: 10, borderRadius: 999, backgroundColor: "rgba(127,127,127,0.15)",
    overflow: "hidden", marginTop: 8,
  },
  progressFill: { height: "100%", backgroundColor: t.colors.tint },
  err: { color: "#ff7676", marginTop: 8 },
}));
