import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTheme, createStyles } from "../../src/theme";
import { initDb } from "../../src/db";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import JSZip from "jszip";

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type ExportJSON = {
  version: number;
  exported_at: number;
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
        is_primary: number;
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

export default function ImportScreen() {
  const { theme } = useTheme();
  const s = styles(theme);
  const [msg, setMsg] = useState("Choose a .zip to import.");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick() {
    const res = await DocumentPicker.getDocumentAsync({
      type: "application/zip",
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;

    await doImport(res.assets[0].uri);
  }

  async function doImport(uri: string) {
    setBusy(true); setErr(null); setPct(0);
    try {
      setMsg("Reading ZIP…");
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToUint8Array(b64);
      const zip = await JSZip.loadAsync(bytes);
      const entry = zip.file("data.json");
      if (!entry) throw new Error("data.json not found in ZIP");
      const text = await entry.async("string");
      const data: ExportJSON = JSON.parse(text);
      if (!data || data.version !== 1) throw new Error("Unsupported or missing export version.");

      setMsg("Opening database…");
      const db = await initDb();

      setMsg("Importing (transaction) …");
      await db.execute("BEGIN IMMEDIATE");

      const total = data.novels.length;
      let count = 0;

      for (const n of data.novels) {
        await db.execute(
          `INSERT INTO novels (title, author, description, cover_path, lang_original, status, slug, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            n.title.trim(),
            n.author ?? null,
            n.description ?? null,
            n.cover_path ?? null,
            n.lang_original ?? null,
            n.status ?? null,
            n.slug ?? null,
            n.created_at ?? Math.floor(Date.now()/1000),
            n.updated_at ?? Math.floor(Date.now()/1000),
          ]
        );
        const row = await db.select(`SELECT last_insert_rowid() AS id`);
        const newNovelId = row[0].id as number;

        for (const ch of n.chapters) {
          await db.execute(
            `INSERT INTO chapters (novel_id, seq, volume, display_title, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              newNovelId,
              ch.seq,
              ch.volume ?? null,
              ch.display_title ?? null,
              ch.created_at ?? Math.floor(Date.now()/1000),
              ch.updated_at ?? Math.floor(Date.now()/1000),
            ]
          );
          const chRow = await db.select(`SELECT last_insert_rowid() AS id`);
          const newChapterId = chRow[0].id as number;

          for (const v of ch.variants) {
            await db.execute(
              `INSERT INTO chapter_variants
               (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newChapterId,
                v.variant_type,
                v.lang,
                v.title ?? null,
                v.content ?? "",
                v.source_url ?? null,
                v.provider ?? null,
                v.model_name ?? null,
                v.is_primary ? 1 : 0,
                v.created_at ?? Math.floor(Date.now()/1000),
                v.updated_at ?? Math.floor(Date.now()/1000),
              ]
            );
          }

          for (const b of ch.bookmarks ?? []) {
            await db.execute(
              `INSERT INTO bookmarks (chapter_id, position_pct, device_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
              [
                newChapterId,
                Number.isFinite(b.position_pct) ? b.position_pct : 0,
                (b.device_id ?? "").slice(0, 128),
                b.created_at ?? Math.floor(Date.now()/1000),
                b.updated_at ?? Math.floor(Date.now()/1000),
              ]
            );
          }
        }

        count++;
        setPct(Math.round((count / Math.max(1, total)) * 100));
        setMsg(`Imported ${count}/${total} novel(s)…`);
      }

      await db.execute("COMMIT");
      setMsg("Import complete.");
      setPct(100);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setMsg("Import failed. Rolling back.");
      try {
        const db = await initDb();
        await db.execute("ROLLBACK");
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Import</Text>
      <Text style={s.sub}>Load your library from a ZIP (data.json inside).</Text>

      <View style={s.panel}>
        <View style={s.row}>
          <Text style={s.bold}>{msg}</Text>
          <Text style={s.dim}>{pct}%</Text>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>

        <TouchableOpacity style={s.btn} disabled={busy} onPress={onPick}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Select ZIP…</Text>}
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
