// pages/Transfer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { initDb } from "../db/init";

type Mode = "import" | "export";

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

export default function Transfer() {
  const location = useLocation();
  const nav = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mode = (params.get("mode") as Mode) || "import";

  const [msg, setMsg] = useState(mode === "export" ? "Ready to export." : "Choose a .zip to import.");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-start export if mode=export (optional)
  useEffect(() => {
    if (mode === "export") {
      // no auto-start to let user click; uncomment to auto-run:
      // onExport();
    }
  }, [mode]);

  async function queryAllForExport(db: any): Promise<ExportJSON> {
    // Pull all novels
    const novels = await db.select(
      `SELECT id, title, author, description, cover_path, lang_original, status, slug, created_at, updated_at
       FROM novels ORDER BY updated_at DESC;`
    );

    const out: ExportJSON = {
      version: 1,
      exported_at: Math.floor(Date.now() / 1000),
      novels: []
    };

    let processed = 0;
    const total = novels.length;

    for (const n of novels) {
      // Chapters for this novel
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
            updated_at: v.updated_at
          })),
          bookmarks: bookmarks.map((b: any) => ({
            position_pct: Number(b.position_pct),
            device_id: b.device_id,
            created_at: b.created_at,
            updated_at: b.updated_at
          }))
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
        chapters: chOut
      });

      processed++;
      setPct(Math.round((processed / Math.max(1, total)) * 100));
      setMsg(`Packing ${processed}/${total} novel(s)…`);
    }

    return out;
  }

  async function onExport() {
    setIsRunning(true);
    setError(null);
    try {
      setMsg("Opening database…");
      const db = await initDb();

      setMsg("Reading data…");
      const data = await queryAllForExport(db);

      setMsg("Creating ZIP…");
      const zip = new JSZip();
      zip.file("data.json", JSON.stringify(data, null, 2));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

      const stamp = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `novels-export-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.zip`;

      // Try File System Access API first
      // @ts-ignore
      if (window.showSaveFilePicker) {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "ZIP Archive", accept: { "application/zip": [".zip"] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        saveAs(blob, name);
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

      if (!data || data.version !== 1) {
        throw new Error("Unsupported or missing export version.");
      }

      setMsg("Opening database…");
      const db = await initDb();

      setMsg("Importing (transaction) …");
      await db.execute("BEGIN IMMEDIATE;");

      // Insert novels/chapters/variants/bookmarks with new IDs
      const total = data.novels.length;
      let count = 0;

      for (const n of data.novels) {
        // Insert novel (no id => new rowid)
        await db.execute(
          `INSERT INTO novels (title, author, description, cover_path, lang_original, status, slug, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            n.title.trim(),
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
        }

        count++;
        setPct(Math.round((count / Math.max(1, total)) * 100));
        setMsg(`Imported ${count}/${total} novel(s)…`);
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
                <button className="btn" onClick={onExport} disabled={isRunning}>Export Now</button>
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
            ? "This will insert new novels, chapters, variants and bookmarks. IDs are regenerated to avoid collisions."
            : "This will export your entire library as a single ZIP containing data.json."}
        </p>
      </section>
    </div>
  );
}
