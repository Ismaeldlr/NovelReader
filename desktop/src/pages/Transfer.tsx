// pages/Transfer.tsx
import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { initDb } from "../db/init";

type Mode = "import" | "export";

/* ==========================
   Export format (v2)
   ========================== */
type ExportJSON = {
  version: 2;                 // bumped to 2
  exported_at: number;        // unix epoch
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

    // NEW: metadata facets (by name, safe to upsert later)
    genres: string[];
    tags: string[];

    // NEW: reading_state for this novel (seq based for portability)
    reading_state: Array<{
      device_id: string;
      chapter_seq: number;   // points at seq in this export
      position_pct: number;  // 0..1
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
      // NEW: per-chapter reading progress rows
      reading_progress: Array<{
        position_pct: number;
        device_id: string;
        created_at: number;
        updated_at: number;
      }>;
    }>;
  }>;
};

export default function Transfer() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mode = (params.get("mode") as Mode) || "import";

  const [msg, setMsg] = useState(mode === "export" ? "Ready to export." : "Choose a .zip to import.");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------- Helpers --------
  async function tableExists(db: any, name: string): Promise<boolean> {
    try {
      const r = await db.select(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;",
        [name]
      );
      return (r?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  function defaultZipName() {
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `novels-export-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(
      t.getHours()
    )}${pad(t.getMinutes())}.zip`;
  }

  // -------- Export --------
  async function queryAllForExport(db: any): Promise<ExportJSON> {
    const haveGenres = await tableExists(db, "genres");
    const haveTags = await tableExists(db, "tags");
    const haveNG = await tableExists(db, "novel_genres");
    const haveNT = await tableExists(db, "novel_tags");
    const haveRP = await tableExists(db, "reading_progress");
    const haveRS = await tableExists(db, "reading_state");

    const novels = await db.select(
      `SELECT id, title, author, description, cover_path, lang_original, status, slug, created_at, updated_at
       FROM novels ORDER BY updated_at DESC;`
    );

    const out: ExportJSON = {
      version: 2,
      exported_at: Math.floor(Date.now() / 1000),
      novels: []
    };

    let processed = 0;
    const total = novels.length || 1;

    for (const n of novels) {
      // facets
      let genres: string[] = [];
      let tags: string[] = [];
      if (haveGenres && haveNG) {
        const gs = await db.select(
          `SELECT g.name FROM novel_genres ng JOIN genres g ON g.id = ng.genre_id WHERE ng.novel_id = ? ORDER BY g.name ASC;`,
          [n.id]
        );
        genres = (gs as Array<{ name: string }>).map(r => r.name);
      }
      if (haveTags && haveNT) {
        const ts = await db.select(
          `SELECT t.name FROM novel_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.novel_id = ? ORDER BY t.name ASC;`,
          [n.id]
        );
        tags = (ts as Array<{ name: string }>).map(r => r.name);
      }

      // reading_state (per novel) -> store by chapter seq
      let reading_state: ExportJSON["novels"][number]["reading_state"] = [];
      if (haveRS) {
        const rs = await db.select(
          `SELECT s.device_id, s.position_pct, s.updated_at, c.seq
             FROM reading_state s
             JOIN chapters c ON c.id = s.chapter_id
            WHERE s.novel_id = ?;`,
          [n.id]
        );
        reading_state = (rs as any[]).map(r => ({
          device_id: r.device_id,
          chapter_seq: Number(r.seq),
          position_pct: Number(r.position_pct),
          updated_at: Number(r.updated_at)
        }));
      }

      // chapters
      const chapters = await db.select(
        `SELECT id, seq, volume, display_title, created_at, updated_at
         FROM chapters WHERE novel_id = ? ORDER BY seq ASC;`,
        [n.id]
      );

      const chOut: ExportJSON["novels"][number]["chapters"] = [];

      for (const ch of chapters) {
        const variants = await db.select(
          `SELECT variant_type, lang, title, content, source_url, provider, model_name,
                  is_primary, created_at, updated_at
           FROM chapter_variants
           WHERE chapter_id = ?
           ORDER BY is_primary DESC, created_at ASC;`,
          [ch.id]
        );

        const bookmarks = await db.select(
          `SELECT position_pct, device_id, created_at, updated_at
           FROM bookmarks
           WHERE chapter_id = ?;`,
          [ch.id]
        );

        let reading_progress: ExportJSON["novels"][number]["chapters"][number]["reading_progress"] =
          [];
        if (haveRP) {
          const rp = await db.select(
            `SELECT position_pct, device_id, created_at, updated_at
               FROM reading_progress WHERE chapter_id = ?;`,
            [ch.id]
          );
          reading_progress = (rp as any[]).map(r => ({
            position_pct: Number(r.position_pct),
            device_id: r.device_id,
            created_at: Number(r.created_at),
            updated_at: Number(r.updated_at)
          }));
        }

        chOut.push({
          seq: ch.seq,
          volume: ch.volume ?? null,
          display_title: ch.display_title ?? null,
          created_at: ch.created_at,
          updated_at: ch.updated_at,
          variants: (variants as any[]).map(v => ({
            variant_type: v.variant_type,
            lang: v.lang,
            title: v.title ?? null,
            content: v.content ?? "",
            source_url: v.source_url ?? null,
            provider: v.provider ?? null,
            model_name: v.model_name ?? null,
            is_primary: Number(v.is_primary) ? 1 : 0,
            created_at: v.created_at,
            updated_at: v.updated_at
          })),
          bookmarks: (bookmarks as any[]).map(b => ({
            position_pct: Number(b.position_pct),
            device_id: b.device_id,
            created_at: b.created_at,
            updated_at: b.updated_at
          })),
          reading_progress
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
        genres,
        tags,
        reading_state,
        chapters: chOut
      });

      processed++;
      setPct(Math.round((processed / total) * 100));
      setMsg(`Packing ${processed}/${novels.length} novel(s)…`);
    }

    return out;
  }

  // IMPORTANT: open the Save dialog FIRST (while still in user gesture)
  async function onExportClick() {
    setIsRunning(true);
    setError(null);

    // prepare a name up front
    const suggestedName = defaultZipName();

    // Try File System Access API immediately
    // @ts-ignore
    let handle: any = null;
    // @ts-ignore
    const canPick = typeof window.showSaveFilePicker === "function";
    if (canPick) {
      try {
        // @ts-ignore
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: "ZIP Archive", accept: { "application/zip": [".zip"] } }]
        });
      } catch (e: any) {
        // User canceled dialog
        setIsRunning(false);
        setMsg("Export canceled.");
        return;
      }
    }

    try {
      setMsg("Opening database…");
      const db = await initDb();

      setMsg("Reading data…");
      const data = await queryAllForExport(db);

      setMsg("Creating ZIP…");
      const zip = new JSZip();
      zip.file("data.json", JSON.stringify(data, null, 2));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        // fallback for engines without FS Access API (or Tauri)
        saveAs(blob, suggestedName);
      }

      setPct(100);
      setMsg("Export complete.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      setMsg("Export failed.");
    } finally {
      setIsRunning(false);
    }
  }

  // -------- Import --------
  async function onPickZip() {
    fileInputRef.current?.click();
  }

  async function onImportFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await onImport(file);
  }

  async function onImport(file: File) {
    setIsRunning(true);
    setError(null);
    setPct(0);
    try {
      setMsg("Reading ZIP…");
      const buf = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buf);
      const entry = zip.file("data.json");
      if (!entry) throw new Error("data.json not found in ZIP");
      const text = await entry.async("string");
      const data: ExportJSON = JSON.parse(text);

      if (!data || (data.version !== 2)) {
        throw new Error("Unsupported or missing export version.");
      }

      setMsg("Opening database…");
      const db = await initDb();

      const haveGenres = await tableExists(db, "genres");
      const haveTags = await tableExists(db, "tags");
      const haveNG = await tableExists(db, "novel_genres");
      const haveNT = await tableExists(db, "novel_tags");
      const haveRP = await tableExists(db, "reading_progress");
      const haveRS = await tableExists(db, "reading_state");

      setMsg("Importing (transaction) …");
      await db.execute("BEGIN IMMEDIATE;");

      const total = data.novels.length || 1;
      let count = 0;

      for (const n of data.novels) {
        // Insert novel
        await db.execute(
          `INSERT INTO novels (title, author, description, cover_path, lang_original, status, slug, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            (n.title || "").trim(),
            n.author ?? null,
            n.description ?? null,
            n.cover_path ?? null,
            n.lang_original ?? null,
            n.status ?? null,
            n.slug ?? null,
            n.created_at ?? Math.floor(Date.now() / 1000),
            n.updated_at ?? Math.floor(Date.now() / 1000)
          ]
        );
        const novelIdRow = await db.select(`SELECT last_insert_rowid() AS id;`);
        const newNovelId = novelIdRow[0].id as number;

        // Upsert genres/tags by name then link
        if (data.version >= 2) {
          if (haveGenres && haveNG && Array.isArray(n.genres)) {
            for (const name of n.genres) {
              const nm = String(name).trim();
              if (!nm) continue;
              await db.execute(`INSERT OR IGNORE INTO genres (name) VALUES (?);`, [nm]);
              const gidRow = await db.select(`SELECT id FROM genres WHERE name = ? LIMIT 1;`, [nm]);
              const gid = gidRow?.[0]?.id;
              if (gid) {
                await db.execute(
                  `INSERT OR IGNORE INTO novel_genres (novel_id, genre_id) VALUES (?,?);`,
                  [newNovelId, gid]
                );
              }
            }
          }
          if (haveTags && haveNT && Array.isArray(n.tags)) {
            for (const name of n.tags) {
              const nm = String(name).trim();
              if (!nm) continue;
              await db.execute(`INSERT OR IGNORE INTO tags (name) VALUES (?);`, [nm]);
              const tidRow = await db.select(`SELECT id FROM tags WHERE name = ? LIMIT 1;`, [nm]);
              const tid = tidRow?.[0]?.id;
              if (tid) {
                await db.execute(
                  `INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?,?);`,
                  [newNovelId, tid]
                );
              }
            }
          }
        }

        // Insert chapters (+ map seq -> new id for reading_state later)
        const seqToId = new Map<number, number>();
        for (const ch of n.chapters) {
          await db.execute(
            `INSERT INTO chapters (novel_id, seq, volume, display_title, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?);`,
            [
              newNovelId,
              ch.seq,
              ch.volume ?? null,
              ch.display_title ?? null,
              ch.created_at ?? Math.floor(Date.now() / 1000),
              ch.updated_at ?? Math.floor(Date.now() / 1000)
            ]
          );
          const chIdRow = await db.select(`SELECT last_insert_rowid() AS id;`);
          const newChapterId = chIdRow[0].id as number;
          seqToId.set(ch.seq, newChapterId);

          // variants
          for (const v of ch.variants) {
            await db.execute(
              `INSERT INTO chapter_variants
               (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
                v.created_at ?? Math.floor(Date.now() / 1000),
                v.updated_at ?? Math.floor(Date.now() / 1000)
              ]
            );
          }

          // bookmarks
          for (const b of ch.bookmarks ?? []) {
            await db.execute(
              `INSERT INTO bookmarks (chapter_id, position_pct, device_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?);`,
              [
                newChapterId,
                Number.isFinite(b.position_pct) ? b.position_pct : 0,
                (b.device_id ?? "").slice(0, 128),
                b.created_at ?? Math.floor(Date.now() / 1000),
                b.updated_at ?? Math.floor(Date.now() / 1000)
              ]
            );
          }

          // reading_progress (v2+)
          if (data.version >= 2 && haveRP && Array.isArray(ch.reading_progress)) {
            for (const r of ch.reading_progress) {
              await db.execute(
                `INSERT INTO reading_progress (novel_id, chapter_id, position_pct, device_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?);`,
                [
                  newNovelId,
                  newChapterId,
                  Number.isFinite(r.position_pct) ? r.position_pct : 0,
                  (r.device_id ?? "").slice(0, 128),
                  r.created_at ?? Math.floor(Date.now() / 1000),
                  r.updated_at ?? Math.floor(Date.now() / 1000)
                ]
              );
            }
          }
        }

        // reading_state (v2+) — remap seq->id
        if (data.version >= 2 && haveRS && Array.isArray(n.reading_state)) {
          for (const s of n.reading_state) {
            const chId = seqToId.get(Number(s.chapter_seq));
            if (!chId) continue;
            await db.execute(
              `INSERT OR REPLACE INTO reading_state
                 (novel_id, chapter_id, position_pct, device_id, updated_at)
               VALUES (?, ?, ?, ?, ?);`,
              [
                newNovelId,
                chId,
                Number.isFinite(s.position_pct) ? s.position_pct : 0,
                (s.device_id ?? "").slice(0, 128),
                s.updated_at ?? Math.floor(Date.now() / 1000)
              ]
            );
          }
        }

        count++;
        setPct(Math.round((count / total) * 100));
        setMsg(`Imported ${count}/${data.novels.length} novel(s)…`);
      }

      await db.execute("COMMIT;");
      setMsg("Import complete.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      setMsg("Import failed. Rolling back.");
      try {
        const db = await initDb();
        await db.execute("ROLLBACK;");
      } catch {}
    } finally {
      setIsRunning(false);
    }
  }

  const title = mode === "import" ? "Import" : "Export";

  return (
    <div className="page">
      <header className="topbar">
        <h1>{title} — {mode === "import" ? "Load a ZIP" : "Create a ZIP"}</h1>
        <span className="status">{error ? "Error" : msg}</span>
      </header>

      <section style={{ maxWidth: 720, margin: "24px auto" }}>
        <div
          style={{
            border: "var(--border)",
            borderRadius: 12,
            padding: 16,
            background: "linear-gradient(180deg, var(--surface-3), var(--surface-2))",
            boxShadow: "var(--shadow)",
          }}
        >
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, letterSpacing: ".3px" }}>{msg}</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{pct}%</div>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--surface-4)", marginTop: 10, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: "var(--accent)",
                transition: "width .25s ease",
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 10 }}>
              {mode === "import" ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    style={{ display: "none" }}
                    onChange={onImportFileChosen}
                  />
                  <button className="btn" onClick={onPickZip} disabled={isRunning}>Select ZIP…</button>
                </>
              ) : (
                <button className="btn" onClick={onExportClick} disabled={isRunning}>Export Now</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Link to="/" className="btn btn-ghost small">← Back to Library</Link>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, color: "#ff7676", fontSize: 14 }}>
              {error}
            </div>
          )}
        </div>

        <p className="status" style={{ marginTop: 12 }}>
          {mode === "import"
            ? "This will insert new novels, chapters, variants, bookmarks, reading progress/state, and genres/tags. IDs are regenerated to avoid collisions."
            : "This will export your entire library (novels, chapters, variants, bookmarks, reading progress/state, genres/tags) as a single ZIP containing data.json."}
        </p>
      </section>
    </div>
  );
}
