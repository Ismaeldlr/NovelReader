import { useState } from "react";
import { Picker } from "@react-native-picker/picker";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdded?: (novelId: number) => void; // notify parent to reload
};

export default function AddNovelSheet({ visible, onClose, onAdded }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"form" | "epub">("form");

  // form fields
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [langOriginal, setLangOriginal] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = title.trim().length > 0 && !saving;

  // epub import state
  const [busy, setBusy] = useState(false);
  const [epubMsg, setEpubMsg] = useState("Pick an EPUB to import.");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  function resetState() {
    setMode("form");
    setErr(null);
    setPct(0);
    setEpubMsg("Pick an EPUB to import.");
    setTitle("");
    setAuthor("");
    setDescription("");
    setLangOriginal("");
    setStatus("");
    setSaving(false);
    setBusy(false);
  }

  async function onAddNovel() {
    if (!canSave) return;
    setSaving(true);
    try {
      const db = await initDb();
      await db.execute(
        `INSERT INTO novels (title, author, description, lang_original, status)
         VALUES (?,?,?,?,?)`,
        [
          title.trim(),
          author.trim() || null,
          description.trim() || null,
          langOriginal.trim() || null,
          status.trim() || null,
        ]
      );
      const row = await db.select(`SELECT last_insert_rowid() AS id`);
      const novelId = Number(row?.[0]?.id ?? 0);
      onAdded?.(novelId);
      onClose();
      resetState();
    } finally {
      setSaving(false);
    }
  }

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

  // ------------------- EPUB IMPORT FLOW -------------------
  async function importEpubFromUri(uri: string) {
    const db = await initDb();
    setBusy(true);
    setPct(0);
    try {
      setEpubMsg("Reading EPUB…");

      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(b64, { base64: true });

      const container = await readZipText(zip, "META-INF/container.xml");
      if (!container) throw new Error("Invalid EPUB: missing META-INF/container.xml");
      const rootfile = attrMatch(container, /\bfull-path="([^"]+)"/i);
      if (!rootfile) throw new Error("Invalid EPUB: missing rootfile path");

      const opfText = await readZipText(zip, rootfile);
      if (!opfText) throw new Error("Invalid EPUB: OPF not found");

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

      const itemTags = findAll(opfText, /<item\b[^>]*>/ig);
      const manifestItems = itemTags
        .map(tag => {
          const id = attrMatch(tag, /\bid="([^"]+)"/i);
          const href = attrMatch(tag, /\bhref="([^"]+)"/i);
          const type = attrMatch(tag, /\bmedia-type="([^"]+)"/i) || "";
          const props = attrMatch(tag, /\bproperties="([^"]*)"/i) || "";
          return id && href ? { id, href, type, props } : null;
        })
        .filter(Boolean) as { id: string; href: string; type: string; props: string }[];

      const idToItem = new Map(manifestItems.map(it => [it.id, it]));
      const spineIds = findAll(opfText, /<itemref\b[^>]*idref="([^"]+)"/ig)
        .map(m => /idref="([^"]+)"/i.exec(m)?.[1] || "")
        .filter(Boolean);

      let htmlItems = spineIds
        .map(id => idToItem.get(id))
        .filter(Boolean)
        .filter((it: any) => {
          const isNav = /\bnav\b/i.test(it.props);
          const isNcx = /application\/x-dtbncx\+xml/i.test(it.type);
          const isHtml = /x?html/i.test(it.type) || /\.x?html?$/i.test(it.href);
          return !isNav && !isNcx && isHtml;
        }) as { id: string; href: string; type: string; props: string }[];

      if (htmlItems.length === 0) {
        const ncxItem = manifestItems.find(it => /x-dtbncx\+xml/i.test(it.type));
        if (ncxItem) {
          const ncx = await readZipText(zip, resolveHref(ncxItem.href));
          if (ncx) {
            const srcs = findAll(ncx, /<content\b[^>]*src="([^"]+)"/ig)
              .map(t => /src="([^"]+)"/i.exec(t)?.[1] || "")
              .filter(Boolean);
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
          props: "",
        })) as any;
      }

      if (htmlItems.length === 0) throw new Error("No readable chapters found in EPUB.");

      // meta
      const metaBlock = /<metadata[\s\S]*?<\/metadata>/i.exec(opfText)?.[0] ?? "";
      const opfTitle = textFromXmlTag(metaBlock, /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
      const opfCreator = textFromXmlTag(metaBlock, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);

      const notCover = (it: { id: string; href: string }) =>
        !/cover|title[-_ ]?page/i.test(it.id) && !/cover|title[-_ ]?page/i.test(it.href);

      const novelTitle = title.trim() || opfTitle || "Imported EPUB";
      const novelAuthor = author.trim() || opfCreator || null;
      const novelDescription = null;

      setEpubMsg("Ensuring novel…");
      await db.execute(
        `INSERT INTO novels (title, author, description) VALUES (?, ?, ?)`,
        [novelTitle, novelAuthor, novelDescription]
      );
      const row = await db.select(`SELECT last_insert_rowid() AS id`);
      const novelId = Number(row?.[0]?.id ?? 0);

      setEpubMsg("Importing chapters…");
      const lang = "en";
      const chapterItems = htmlItems.filter(notCover);
      const seqRow = await db.select("SELECT IFNULL(MAX(seq), 0) as m FROM chapters WHERE novel_id = ?", [novelId]);
      let seq = (seqRow[0]?.m ?? 0) + 1;

      const clean: Array<{ displayTitle: string; text: string }> = [];
      for (const item of chapterItems) {
        const path = resolveHref(item.href);
        const html = await readZipText(zip, path);
        if (!html) continue;
        const displayTitle = extractTitle(html) || `Chapter ${seq}`;
        const text = htmlToPlainText(html);
        const t = (displayTitle || "").toLowerCase();
        const badTitle = /(table of contents|contents|toc|copyright|title page)/i.test(t);
        const isInformation = t.trim() === "information";
        const tooShort = text.replace(/\s+/g, " ").trim().length < 60;
        if (!badTitle && !isInformation && !tooShort) clean.push({ displayTitle, text });
      }

      let processed = 0;
      for (const ch of clean) {
        await db.execute(
          "INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?,?,?,?)",
          [novelId, seq, null, ch.displayTitle]
        );
        const chRow = await db.select(
          "SELECT id FROM chapters WHERE novel_id = ? AND seq = ? LIMIT 1",
          [novelId, seq]
        );
        const chId = Number(chRow[0]?.id ?? 0);

        await db.execute(
          "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
          [chId, "RAW", lang, ch.displayTitle, ch.text, null, "epub", null, 0]
        );

        seq++;
        processed++;
        setPct(Math.round((processed / Math.max(1, clean.length)) * 100));
      }

      setEpubMsg(`Imported ${processed} chapter(s).`);
      setPct(100);
      onAdded?.(novelId);
      onClose();
      resetState();
    } catch (e: any) {
      setErr(e?.message || String(e));
      setEpubMsg("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---- helpers (Hermes-safe) ----
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
      "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
      "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&#160;": " ",
    };
    return s.replace(/&[a-zA-Z#0-9]+;/g, m => map[m] ?? m);
  }

  // --------------------------------------------------------

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={-insets.bottom} // flush to bottom
        style={s.sheetWrap}
      >
        <View style={[s.sheet, { paddingBottom: insets.bottom + theme.spacing(4) }]}>
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

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.label}>Original Language</Text>
                  <View style={[s.input, { padding: 0 }]}>
                    <Picker
                      selectedValue={langOriginal}
                      onValueChange={setLangOriginal}
                      style={{ color: theme.colors.text, width: "100%" }}
                      dropdownIconColor={theme.colors.textDim}
                    >
                      <Picker.Item label="— Select —" value="" />
                      <Picker.Item label="English" value="en" />
                      <Picker.Item label="Chinese" value="zh" />
                      <Picker.Item label="Korean" value="ko" />
                      <Picker.Item label="Japanese" value="ja" />
                      <Picker.Item label="Spanish" value="es" />
                    </Picker>
                  </View>
                </View>

                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.label}>Status</Text>
                  <View style={[s.input, { padding: 0 }]}>
                    <Picker
                      selectedValue={status}
                      onValueChange={setStatus}
                      style={{ color: theme.colors.text, width: "100%" }}
                      dropdownIconColor={theme.colors.textDim}
                    >
                      <Picker.Item label="— Select —" value="" />
                      <Picker.Item label="Ongoing" value="ongoing" />
                      <Picker.Item label="Completed" value="completed" />
                      <Picker.Item label="Hiatus" value="hiatus" />
                      <Picker.Item label="Dropped" value="dropped" />
                    </Picker>
                  </View>
                </View>
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

                <Pressable style={s.btnGhost} onPress={onClose}>
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

                <Pressable style={s.btnGhost} onPress={onClose}>
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
  );
}

const styles = createStyles((t) =>
  StyleSheet.create({
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
  })
);
function textFromXmlTag(metaBlock: string, arg1: RegExp) {
    throw new Error("Function not implemented.");
}

