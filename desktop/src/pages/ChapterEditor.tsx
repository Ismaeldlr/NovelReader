import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { initDb } from "../db/init";

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
      await loadOrCreateEditableVariant(db, chId);
      setMsg("Ready");
    })().catch(e => setMsg("DB error: " + String(e)));
  }, [novelId, chId]);

  // Load the preferred variant to edit. If none, create a HUMAN draft.
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [chapterIdNum, "HUMAN", "en", defaultTitle, "", null, null, null]
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
        await db.execute(`UPDATE chapter_variants SET is_primary = 0 WHERE chapter_id = ?`, [chId]);
        await db.execute(`UPDATE chapter_variants SET is_primary = 1 WHERE id = ?`, [current.id]);
      }

      await reloadCurrent();
      setMsg("Saved");
    } catch (e) {
      setMsg("Save error: " + String(e));
    }
  }

  async function saveAndExit() {
    await saveChanges();
    nav(`/novel/${novelId}/chapter/${chId}`); // back to reader
  }

  async function reloadCurrent() {
    const db = dbRef.current;
    await loadOrCreateEditableVariant(db, chId);
  }

  // ===== Auto-growing textarea (no inner scrollbar) =====
  const taRef = useRef<HTMLTextAreaElement>(null);
  function autoSizeTA() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + 240 + "px";
  }
  useEffect(() => { autoSizeTA(); }, []);
  useEffect(() => { autoSizeTA(); }, [content]);

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
    // Use normal page scroll; no inner scroller
    <div className="editor-page">
      <div
        className="reader-layout"
        style={{ display: "block", height: "auto" }}   // override 2-col grid & 100vh
      >
        <main
          className="reader-main"
          style={{ overflow: "visible", paddingLeft: 28, paddingRight: 28 }} // let body scroll
        >
          <div className="reader-status">{msg}</div>

          {!current ? (
            <div className="empty">
              <div className="empty-art" />
              <p>No editable content yet.</p>
            </div>
          ) : (
            <article
              className="reader-article"
              style={{ maxWidth: 900, margin: "0 auto" }}  // keep centered width
            >
              {/* Top editor bar */}
              <div className="editor-toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button className="btn" onClick={saveAndExit} title="Save & go back to reader">
                  Save & Exit
                </button>
                <button className="btn" onClick={saveChanges} title="Ctrl/Cmd+S">
                  Save
                </button>

                <span className="status" style={{ marginLeft: 8 }}>|</span>

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
                  <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ width: 120 }}>
                    <option value="en">English</option>
                    <option value="zh">Chinese</option>
                    <option value="ko">Korean</option>
                    <option value="ja">Japanese</option>
                    <option value="es">Spanish</option>
                  </select>
                </label>

                <span style={{ marginLeft: "auto" }}>
                  <Link to={`/novel/${novelId}/chapter/${chId}`} className="btn btn-ghost small">
                    ← Back to Reader
                  </Link>
                </span>
              </div>

              {/* Title input */}
              <input
                className="reader-title"
                style={{
                  color: "white",
                  width: "100%",
                  background: "transparent",
                  border: 0,
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginTop: 40,
                  marginBottom: 30,
                  outline: "none",
                  boxShadow: "none",
                }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled chapter"
              />

              {/* Content editor (auto-growing, no inner scrollbar) */}
              <textarea
                ref={taRef}
                className="editor-textarea"
                style={{
                  fontFamily: "Arial, sans-serif",
                  fontSize: 16,
                  color: "white",
                  width: "100%",
                  minHeight: "40vh",
                  resize: "none",         // no manual handle
                  overflow: "hidden",     // no inner scroll
                  background: "transparent",
                  border: 0,
                  borderRadius: 8,
                  padding: "12px 14px",
                  lineHeight: 1.8,
                  outline: "none",
                  boxShadow: "none",
                }}
                value={content}
                onInput={autoSizeTA}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write or paste your chapter content here…"
              />
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
