import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { initDb } from "../db/init";

type ChapterListItem = { id: number; seq: number; display_title: string | null };
type ChapterVariant = {
  id: number;
  title: string | null;
  content: string;
  variant_type: string;
  lang: string;
  is_primary?: number;
};

export default function ChapterEditor() {
  const { id, chapterId } = useParams();
  const novelId = Number(id);
  const chId = Number(chapterId);
  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [current, setCurrent] = useState<ChapterVariant | null>(null);

  // editable form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [variantType, setVariantType] = useState("HUMAN");
  const [lang, setLang] = useState("en");
  const [isPrimary, setIsPrimary] = useState(false);

  const [msg, setMsg] = useState("loading…");
  const dbRef = useRef<any>(null);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const db = await initDb();
      dbRef.current = db;
      await loadChapters(db);
      await loadOrCreateEditableVariant(db, chId);
      setMsg("Ready");
    })().catch(e => setMsg("DB error: " + String(e)));
  }, [novelId, chId]);

  async function loadChapters(db: any) {
    const rows = await db.select(
      "SELECT id, seq, display_title FROM chapters WHERE novel_id = ? ORDER BY seq ASC;",
      [novelId]
    );
    setChapters(rows as ChapterListItem[]);
  }

  // Load the preferred variant to edit. If there is none, create a HUMAN draft variant.
  async function loadOrCreateEditableVariant(db: any, chapterIdNum: number) {
    const rows = await db.select(
      `SELECT id, title, content, variant_type, lang, is_primary
       FROM chapter_variants
       WHERE chapter_id = ?
       ORDER BY is_primary DESC,
                CASE variant_type
                  WHEN 'OFFICIAL' THEN 1
                  WHEN 'HUMAN' THEN 2
                  WHEN 'AI' THEN 3
                  WHEN 'MTL' THEN 4
                  WHEN 'RAW' THEN 5
                  ELSE 6
                END ASC
       LIMIT 1;`,
      [chapterIdNum]
    );

    if (rows[0]) {
      const v = rows[0] as ChapterVariant;
      setCurrent(v);
      setTitle(v.title || "");
      setContent(v.content || "");
      setVariantType(v.variant_type || "HUMAN");
      setLang(v.lang || "en");
      setIsPrimary(Boolean(v.is_primary));
      return;
    }

    // No variant exists. Create a basic HUMAN draft.
    const defaultTitle = "Untitled chapter";
    await db.execute(
      `INSERT INTO chapter_variants
       (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chapterIdNum, "HUMAN", "en", defaultTitle, "", null, null, null, 0]
    );

    const created = await db.select(
      `SELECT id, title, content, variant_type, lang, is_primary
       FROM chapter_variants
       WHERE chapter_id = ?
       ORDER BY id DESC LIMIT 1;`,
      [chapterIdNum]
    );

    const v = created[0] as ChapterVariant;
    setCurrent(v);
    setTitle(v.title || "");
    setContent(v.content || "");
    setVariantType(v.variant_type || "HUMAN");
    setLang(v.lang || "en");
    setIsPrimary(Boolean(v.is_primary));
  }

  function openChapter(cid: number) {
    nav(`/novel/${novelId}/editor/${cid}`);
  }

  async function deleteChapter(cid: number) {
    try {
      const db = dbRef.current ?? (await initDb());
      await db.execute("DELETE FROM chapters WHERE id = ?", [cid]);
      await loadChapters(db);
      setMsg("Chapter deleted.");
      // If we deleted the current chapter, go back to novel
      if (cid === chId) nav(`/novel/${novelId}`);
    } catch (e) {
      setMsg("Delete error: " + String(e));
    }
  }

  // Save updates on the current variant
  async function saveChanges() {
    if (!current) return;
    const db = dbRef.current;
    try {
      await db.execute(
        `UPDATE chapter_variants
         SET title = ?, content = ?, variant_type = ?, lang = ?, updated_at = CAST(strftime('%s','now') AS INTEGER)
         WHERE id = ?`,
        [title.trim(), content, variantType.trim() || "HUMAN", lang.trim() || "en", current.id]
      );

      // If marking as primary, update flags
      if (isPrimary) {
        await db.execute(
          `UPDATE chapter_variants SET is_primary = 0 WHERE chapter_id = ?`,
          [chId]
        );
        await db.execute(
          `UPDATE chapter_variants SET is_primary = 1 WHERE id = ?`,
          [current.id]
        );
      }

      // Reload the row
      await reloadCurrent();
      setMsg("Saved");
    } catch (e) {
      setMsg("Save error: " + String(e));
    }
  }

  // Duplicate as a new variant (defaults to HUMAN), then switch to it
  async function saveAsNewVariant(newType = "HUMAN") {
    if (!current) return;
    const db = dbRef.current;
    try {
      await db.execute(
        `INSERT INTO chapter_variants
         (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [chId, newType, lang.trim() || "en", title.trim() || null, content, null, null, null]
      );
      // Load the latest variant and switch form to it
      const rows = await db.select(
        `SELECT id, title, content, variant_type, lang, is_primary
         FROM chapter_variants
         WHERE chapter_id = ?
         ORDER BY id DESC LIMIT 1;`,
        [chId]
      );
      const v = rows[0] as ChapterVariant;
      setCurrent(v);
      setTitle(v.title || "");
      setContent(v.content || "");
      setVariantType(v.variant_type || "HUMAN");
      setLang(v.lang || "en");
      setIsPrimary(Boolean(v.is_primary));
      setMsg("Saved as new variant");
    } catch (e) {
      setMsg("Save error: " + String(e));
    }
  }

  async function reloadCurrent() {
    const db = dbRef.current;
    await loadOrCreateEditableVariant(db, chId);
  }

  // Ctrl/Cmd+S to save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if ((isMac && e.metaKey && e.key.toLowerCase() === "s") || (!isMac && e.ctrlKey && e.key.toLowerCase() === "s")) {
        e.preventDefault();
        saveChanges();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [title, content, variantType, lang, isPrimary, current]);

  return (
    <div className="reader-layout">
      <aside className="reader-sidebar">
        <div className="reader-sidebar-header">
          <Link to="/" className="btn btn-ghost small">← Library</Link>
          <Link to={`/novel/${novelId}`} className="btn btn-ghost small">← Novel</Link>
          <Link to={`/novel/${novelId}/chapter/${chId}`} className="btn btn-ghost small">← Reader</Link>
        </div>

        <div className="chapter-scroll">
          {chapters.map(c => (
            <div key={c.id} className="chapter-item">
              <button
                className={`chapter-nav ${c.id === chId ? "active" : ""}`}
                onClick={() => openChapter(c.id)}
                title={c.display_title || `Chapter ${c.seq}`}
              >
                <span className="chip">#{c.seq}</span>
                <span className="ellipsis">{c.display_title || `Chapter ${c.seq}`}</span>
              </button>

              <button
                className="deleteButton"
                onClick={() => deleteChapter(c.id)}
              >
                <svg viewBox="0 0 448 512" className="deleteIcon">
                  <path d="M135.2 17.7L128 32H32C14.3 32 0 
                    46.3 0 64S14.3 96 32 96H416c17.7 0 
                    32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 
                    6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 
                    6.8-28.6 17.7zM416 128H32L53.2 467c1.6 
                    25.3 22.6 45 47.9 45H346.9c25.3 0 
                    46.3-19.7 47.9-45L416 128z"></path>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main className="reader-main">
        <div className="reader-status">{msg}</div>

        {!current ? (
          <div className="empty">
            <div className="empty-art" />
            <p>No editable content yet.</p>
          </div>
        ) : (
          <article className="reader-article">
            {/* Simple toolbar */}
            <div className="editor-toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button className="btn" onClick={saveChanges} title="Ctrl/Cmd+S">Save</button>
              <button className="btn" onClick={() => saveAsNewVariant("HUMAN")}>Save as New Variant</button>

              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>Primary</span>
                <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
              </label>

              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>Type</span>
                <select value={variantType} onChange={(e) => setVariantType(e.target.value)}>
                  <option value="OFFICIAL">OFFICIAL</option>
                  <option value="HUMAN">HUMAN</option>
                  <option value="AI">AI</option>
                  <option value="MTL">MTL</option>
                  <option value="RAW">RAW</option>
                </select>
              </label>

              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>Lang</span>
                <input
                  type="text"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  placeholder="en"
                  style={{ width: 90 }}
                />
              </label>
            </div>

            {/* Title input */}
            <input
              className="reader-title"
              style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled chapter"
            />

            {/* Content editor */}
            <textarea
              className="editor-textarea"
              style={{ width: "100%", minHeight: "60vh", resize: "vertical", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "12px 14px", lineHeight: 1.6 }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write or paste your chapter content here…"
            />
          </article>
        )}
      </main>
    </div>
  );
}
