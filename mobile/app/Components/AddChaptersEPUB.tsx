import { useState } from "react";
import {
  Modal, View, Text, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";

type Props = {
  visible: boolean;
  novelId: number;
  onClose: () => void;
  onImported?: (addedCount: number) => void; // callback to refresh UI
  lang?: string; // default "en"
};

export default function AddChaptersEPUB({ visible, onClose, onImported, novelId, lang = "en" }: Props) {
  const { theme } = useTheme();
  const s = styles(theme);
  const insets = useSafeAreaInsets();

  const [busy, setBusy] = useState(false);
  const [epubMsg, setEpubMsg] = useState("Pick an EPUB to import.");
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setBusy(false);
    setEpubMsg("Pick an EPUB to import.");
    setPct(0);
    setErr(null);
  }

  async function onPickEpub() {
    setErr(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/epub+zip", "application/zip", ".epub"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    await importEpubToNovel(res.assets[0].uri);
  }

  async function importEpubToNovel(uri: string) {
    const db = await initDb();
    setBusy(true);
    setPct(0);
    try {
      setEpubMsg("Reading EPUB…");
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(b64, { base64: true });

      // 1) container.xml → OPF path
      const container = await readZipText(zip, "META-INF/container.xml");
      if (!container) throw new Error("Invalid EPUB: missing META-INF/container.xml");
      const rootfile = attr(container, /\bfull-path="([^"]+)"/i);
      if (!rootfile) throw new Error("Invalid EPUB: missing rootfile path");

      // 2) read OPF
      const opfText = await readZipText(zip, rootfile);
      if (!opfText) throw new Error("Invalid EPUB: OPF not found");

      // helpers for paths
      const basePath = rootfile.split("/").slice(0, -1).join("/");
      const joinPath = (a: string, b: string) => {
        const clean = (x: string) => x.replace(/^\/+/, "");
        if (!a) return clean(b);
        if (b.startsWith("/")) return clean(b);
        const stack = a.split("/").filter(Boolean);
        for (const p of b.split("/")) {
          if (!p || p === ".") continue;
          if (p === "..") stack.pop(); else stack.push(p);
        }
        return stack.join("/");
      };
      const resolveHref = (href: string) => joinPath(basePath, decodeURI(href));

      // 3) parse manifest & spine (Hermes-safe)
      const itemTags = findAll(opfText, /<item\b[^>]*>/ig);
      const manifest = itemTags.map(tag => {
        const id = attr(tag, /\bid="([^"]+)"/i);
        const href = attr(tag, /\bhref="([^"]+)"/i);
        const type = attr(tag, /\bmedia-type="([^"]+)"/i) || "";
        const props = attr(tag, /\bproperties="([^"]*)"/i) || "";
        return (id && href) ? { id, href, type, props } : null;
      }).filter(Boolean) as { id: string; href: string; type: string; props: string }[];
      const idToItem = new Map(manifest.map(it => [it.id, it]));
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

      // Fallback: NCX
      if (htmlItems.length === 0) {
        const ncxItem = manifest.find(it => /x-dtbncx\+xml/i.test(it.type));
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
                const mi = manifest.find(it => it.href.replace(/^\.\//, "") === clean.replace(/^\.\//, ""));
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

      // Fallback: scan zip under OPF dir
      if (htmlItems.length === 0) {
        const all = Object.keys((zip as any).files || {});
        const base = basePath ? basePath + "/" : "";
        const candidates = all
          .filter(p => p.toLowerCase().startsWith(base.toLowerCase()))
          .filter(p => /\.x?html?$/i.test(p))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        htmlItems = candidates.map(href => ({ id: href, href: href.replace(base, ""), type: "application/xhtml+xml", props: "" })) as any;
      }

      if (htmlItems.length === 0) throw new Error("No readable chapters found in EPUB.");

      // filter out obvious non-chapters
      const notCover = (it: { id: string; href: string }) =>
        !/cover|title[-_ ]?page/i.test(it.id) && !/cover|title[-_ ]?page/i.test(it.href);

      // next seq in this novel
      const seqRow = await db.select("SELECT IFNULL(MAX(seq), 0) as m FROM chapters WHERE novel_id = ?", [novelId]);
      let seq = Number(seqRow?.[0]?.m ?? 0) + 1;

      setEpubMsg("Importing chapters…");

      const chapterItems = htmlItems.filter(notCover);
      const clean: Array<{ displayTitle: string; text: string }> = [];

      for (const item of chapterItems) {
        const path = resolveHref(item.href);
        const html = await readZipText(zip, path);
        if (!html) continue;
        const displayTitle = extractTitle(html) || `Chapter ${seq}`;
        const text = htmlToPlainText(html);
        const ttxt = (displayTitle || "").toLowerCase();
        const badTitle = /(table of contents|contents|toc|copyright|title page)/i.test(ttxt);
        const isInformation = ttxt.trim() === "information";
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
        const chId = Number(chRow?.[0]?.id ?? 0);

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
      onImported?.(processed);
      onClose();
      reset();
    } catch (e: any) {
      setErr(e?.message || String(e));
      setEpubMsg("Import failed.");
    } finally {
      setBusy(false);
    }
  }

  // ------- tiny helpers (no DOM, Hermes-safe) -------
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
  function attr(s: string, re: RegExp) {
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
      "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt": ">", "&quot;": "\"",
      "&#39;": "'", "&apos;": "'", "&#160;": " ",
    };
    return s.replace(/&[a-zA-Z#0-9]+;/g, m => map[m] ?? m);
  }

  // --------------- UI ---------------
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={s.backdrop} onPress={() => { reset(); onClose(); }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={-insets.bottom} // flush to bottom
        style={s.sheetWrap}
      >
        <View style={[s.sheet, { paddingBottom: insets.bottom + theme.spacing(4) }]}>
          <Text style={s.title}>Import EPUB</Text>
          <Text style={s.dim}>{epubMsg}</Text>

          <View style={s.track}>
            <View style={[s.fill, { width: `${pct}%` }]} />
          </View>

          {err ? <Text style={s.err}>{err}</Text> : null}

          <View style={s.actions}>
            <Pressable style={s.btnGhost} onPress={() => { reset(); onClose(); }}>
              <Text style={s.btnGhostText}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable disabled={busy} onPress={onPickEpub} style={[s.btn, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Select EPUB…</Text>}
            </Pressable>
          </View>
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
    title: { color: t.colors.text, fontSize: t.font.lg, fontWeight: "800", marginBottom: 4 },
    dim: { color: t.colors.textDim },
    track: { height: 10, borderRadius: 999, backgroundColor: "rgba(127,127,127,0.15)", overflow: "hidden", marginTop: 8 },
    fill: { height: "100%", backgroundColor: t.colors.tint },
    err: { color: "#ff7676", marginTop: 8 },

    actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
    btn: { backgroundColor: t.colors.tint, paddingVertical: 10, paddingHorizontal: 16, borderRadius: t.radius.md },
    btnText: { color: "#fff", fontWeight: "700" },
    btnGhost: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: t.radius.md },
    btnGhostText: { color: t.colors.textDim, fontWeight: "700" },
  })
);
