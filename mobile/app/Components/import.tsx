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

const nowSec = () => Math.floor(Date.now() / 1000);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* ==========================
   Export format (v1 & v2)
   ========================== */
type ExportJSON = {
  version: 1 | 2;
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

    // v2 additions (optional in typing for back-compat with v1)
    genres?: string[];
    tags?: string[];
    reading_state?: Array<{
      device_id: string;
      chapter_seq: number;
      position_pct: number; // 0..1
      updated_at: number;
    }>;

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
      // v2 addition
      reading_progress?: Array<{
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

  async function upsertByName(db: any, table: "tags" | "genres", name: string): Promise<number | null> {
    const nm = (name ?? "").trim();
    if (!nm) return null;
    const sl = slugify(nm);

    // Insert or ignore; then read id by name (or slug as a fallback)
    await db.execute(
      `INSERT OR IGNORE INTO ${table} (name, slug, created_at${table === "tags" ? ", updated_at" : ""})
       VALUES (?, ?, unixepoch()${table === "tags" ? ", unixepoch()" : ""})`,
      [nm, sl]
    );

    const rows = await db.select(`SELECT id FROM ${table} WHERE name = ? OR slug = ? LIMIT 1`, [nm, sl]);
    return rows?.[0]?.id ?? null;
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
      if (!data || (data.version !== 1 && data.version !== 2)) {
        throw new Error("Unsupported or missing export version.");
      }

      setMsg("Opening database…");
      const db = await initDb();

      setMsg("Importing (transaction)…");
      await db.execute("BEGIN IMMEDIATE");

      const total = data.novels.length;
      let count = 0;

      for (const n of data.novels) {
        // 1) Create novel
        await db.execute(
          `INSERT INTO novels (title, author, description, cover_path, lang_original, status, slug, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            (n.title ?? "").trim() || "Untitled",
            n.author ?? null,
            n.description ?? null,
            n.cover_path ?? null,
            n.lang_original ?? null,
            n.status ?? null,
            n.slug ?? null,
            n.created_at ?? nowSec(),
            n.updated_at ?? nowSec(),
          ]
        );
        const row = await db.select(`SELECT last_insert_rowid() AS id`);
        const newNovelId = row[0].id as number;

        // 2) v2 metadata facets (genres/tags)
        if (data.version === 2) {
          const genres = Array.isArray(n.genres) ? n.genres : [];
          const tags = Array.isArray(n.tags) ? n.tags : [];

          for (const g of genres) {
            const gid = await upsertByName(db, "genres", g);
            if (gid != null) {
              await db.execute(
                `INSERT OR IGNORE INTO novel_genres (novel_id, genre_id) VALUES (?, ?)`,
                [newNovelId, gid]
              );
            }
          }
          for (const tname of tags) {
            const tid = await upsertByName(db, "tags", tname);
            if (tid != null) {
              await db.execute(
                `INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?, ?)`,
                [newNovelId, tid]
              );
            }
          }
        }

        // 3) Chapters (track seq -> id map)
        const seqToId = new Map<number, number>();

        for (const ch of n.chapters) {
          await db.execute(
            `INSERT INTO chapters (novel_id, seq, volume, display_title, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              newNovelId,
              ch.seq,
              ch.volume ?? null,
              ch.display_title ?? null,
              ch.created_at ?? nowSec(),
              ch.updated_at ?? nowSec(),
            ]
          );
          const chRow = await db.select(`SELECT last_insert_rowid() AS id`);
          const newChapterId = chRow[0].id as number;
          seqToId.set(ch.seq, newChapterId);

          // variants
          for (const v of ch.variants || []) {
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
                v.created_at ?? nowSec(),
                v.updated_at ?? nowSec(),
              ]
            );
          }

          // bookmarks
          for (const b of ch.bookmarks || []) {
            await db.execute(
              `INSERT INTO bookmarks (chapter_id, position_pct, device_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)`,
              [
                newChapterId,
                Number.isFinite(b.position_pct) ? clamp01(b.position_pct) : 0,
                String(b.device_id ?? "").slice(0, 128),
                b.created_at ?? nowSec(),
                b.updated_at ?? nowSec(),
              ]
            );
          }

          // v2: per-chapter reading_progress
          if (data.version === 2 && Array.isArray(ch.reading_progress)) {
            for (const rp of ch.reading_progress) {
              await db.execute(
                `INSERT INTO reading_progress (novel_id, chapter_id, position_pct, device_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(chapter_id, device_id) DO UPDATE SET
                   position_pct = excluded.position_pct,
                   updated_at   = excluded.updated_at`,
                [
                  newNovelId,
                  newChapterId,
                  Number.isFinite(rp.position_pct) ? clamp01(rp.position_pct) : 0,
                  String(rp.device_id ?? "").slice(0, 128),
                  rp.created_at ?? nowSec(),
                  rp.updated_at ?? nowSec(),
                ]
              );
            }
          }
        }

        // 4) v2: reading_state (seq-based → map to chapter_id)
        if (data.version === 2 && Array.isArray(n.reading_state)) {
          for (const rs of n.reading_state) {
            const chId = seqToId.get(rs.chapter_seq);
            if (!chId) continue; // skip if seq not found
            await db.execute(
              `INSERT INTO reading_state (novel_id, chapter_id, position_pct, device_id, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(novel_id, device_id) DO UPDATE SET
                 chapter_id   = excluded.chapter_id,
                 position_pct = excluded.position_pct,
                 updated_at   = excluded.updated_at`,
              [
                newNovelId,
                chId,
                Number.isFinite(rs.position_pct) ? clamp01(rs.position_pct) : 0,
                String(rs.device_id ?? "").slice(0, 128),
                rs.updated_at ?? nowSec(),
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
