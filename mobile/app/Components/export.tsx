import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";

type ExportJSON = {
  version: number;
  exported_at: number; // unix epoch
  novels: Array<{
    title: string;
    author: string | null;
    description: string | null;
    cover_path: string | null;
    lang_original: string | null;
    status: string | null;
    slug: string | null;
    created_at: number;
    updated_at: number;
    chapters: Array<{
      seq: number;
      volume: number | null;
      display_title: string | null;
      created_at: number;
      updated_at: number;
      variants: Array<{
        variant_type: string;
        lang: string;
        title: string | null;
        content: string;
        source_url: string | null;
        provider: string | null;
        model_name: string | null;
        is_primary: number; // 0/1
        created_at: number;
        updated_at: number;
      }>;
      bookmarks: Array<{
        position_pct: number;
        device_id: string;
        created_at: number;
        updated_at: number;
      }>;
    }>;
  }>;
};

export default function ExportScreen() {
  const { theme } = useTheme();
  const s = styles(theme);
  const [msg, setMsg] = useState("Ready to export.");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function queryAllForExport(): Promise<ExportJSON> {
    const db = await initDb();

    const novels = await db.select(
      `SELECT id, title, author, description, cover_path, lang_original, status, slug, created_at, updated_at
       FROM novels ORDER BY updated_at DESC`
    );

    const out: ExportJSON = { version: 1, exported_at: Math.floor(Date.now()/1000), novels: [] };
    let processed = 0;

    for (const n of novels) {
      const chapters = await db.select(
        `SELECT id, seq, volume, display_title, created_at, updated_at
         FROM chapters WHERE novel_id = ? ORDER BY seq ASC`, [n.id]
      );

      const chOut: ExportJSON["novels"][number]["chapters"] = [];

      for (const ch of chapters) {
        const variants = await db.select(
          `SELECT variant_type, lang, title, content, source_url, provider, model_name,
                  is_primary, created_at, updated_at
           FROM chapter_variants
           WHERE chapter_id = ?
           ORDER BY is_primary DESC, created_at ASC`, [ch.id]
        );

        const bookmarks = await db.select(
          `SELECT position_pct, device_id, created_at, updated_at
           FROM bookmarks WHERE chapter_id = ?`, [ch.id]
        );

        chOut.push({
          seq: ch.seq,
          volume: ch.volume ?? null,
          display_title: ch.display_title ?? null,
          created_at: ch.created_at,
          updated_at: ch.updated_at,
          variants: variants.map((v: any) => ({
            variant_type: v.variant_type,
            lang: v.lang,
            title: v.title ?? null,
            content: v.content,
            source_url: v.source_url ?? null,
            provider: v.provider ?? null,
            model_name: v.model_name ?? null,
            is_primary: Number(v.is_primary) ? 1 : 0,
            created_at: v.created_at,
            updated_at: v.updated_at,
          })),
          bookmarks: bookmarks.map((b: any) => ({
            position_pct: Number(b.position_pct),
            device_id: b.device_id,
            created_at: b.created_at,
            updated_at: b.updated_at,
          })),
        });
      }

      out.novels.push({
        title: n.title,
        author: n.author ?? null,
        description: n.description ?? null,
        cover_path: n.cover_path ?? null,
        lang_original: n.lang_original ?? null,
        status: n.status ?? null,
        slug: n.slug ?? null,
        created_at: n.created_at,
        updated_at: n.updated_at,
        chapters: chOut,
      });

      processed++;
      setPct(Math.round((processed / Math.max(1, novels.length || 1)) * 100));
      setMsg(`Packing ${processed}/${novels.length} novel(s)…`);
    }

    return out;
  }

  async function onExport() {
    setBusy(true); setErr(null); setPct(0);
    try {
      setMsg("Reading data…");
      const data = await queryAllForExport();

      setMsg("Creating ZIP…");
      const zip = new JSZip();
      zip.file("data.json", JSON.stringify(data, null, 2));
      const blob = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });

      const stamp = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `novels-export-${stamp.getFullYear()}${pad(stamp.getMonth()+1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`;
      const fileUri = FileSystem.cacheDirectory + name;

      // Write base64 to file
      await FileSystem.writeAsStringAsync(fileUri, blob, { encoding: FileSystem.EncodingType.Base64 });

      setMsg("Opening share sheet…");
      await Sharing.shareAsync(fileUri, { mimeType: "application/zip", dialogTitle: "Export Library" });

      setPct(100);
      setMsg("Export complete.");
    } catch (e: any) {
      setErr(e?.message || String(e));
      setMsg("Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Export</Text>
      <Text style={s.sub}>Create a ZIP containing your entire library.</Text>

      <View style={s.panel}>
        <View style={s.row}>
          <Text style={s.bold}>{msg}</Text>
          <Text style={s.dim}>{pct}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>

        <TouchableOpacity style={s.btn} disabled={busy} onPress={onExport}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Export Now</Text>}
        </TouchableOpacity>

        {err ? <Text style={s.err}>{err}</Text> : null}
      </View>
    </View>
  );
}

const styles = createStyles((t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.bg, padding: t.spacing(4) },
  title: { color: t.colors.text, fontSize: t.font.xl, fontWeight: "800", marginTop: t.spacing(40) },
  sub: { color: t.colors.textDim, marginTop: t.spacing(1) },
  panel: {
    marginTop: t.spacing(4),
    backgroundColor: t.colors.card,
    borderRadius: t.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    padding: t.spacing(3),
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: t.spacing(2) },
  bold: { color: t.colors.text, fontWeight: "700" },
  dim: { color: t.colors.textDim, fontSize: t.font.sm },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "rgba(127,127,127,0.15)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: t.colors.tint },
  btn: {
    marginTop: t.spacing(3),
    backgroundColor: t.colors.tint,
    paddingVertical: t.spacing(3),
    borderRadius: t.radius.md,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  err: { color: "#ff7676", marginTop: t.spacing(2) },
}));
