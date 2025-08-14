import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { initDb } from "../db/init";

type ChapterListItem = { id: number; seq: number; display_title: string | null };
type ChapterVariant = { id: number; title: string | null; content: string; variant_type: string; lang: string };

export default function Reader() {
  const { id, chapterId } = useParams();
  const novelId = Number(id);
  const chId = Number(chapterId);
  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [current, setCurrent] = useState<ChapterVariant | null>(null);
  const [msg, setMsg] = useState("loading…");
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const db = await initDb();
      await loadChapters(db);
      await loadCurrent(db, chId);
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

  async function loadCurrent(db: any, chapterIdNum: number) {
    // prefer is_primary, then OFFICIAL, then HUMAN, then AI, then MTL, then RAW
    const rows = await db.select(
      `SELECT id, title, content, variant_type, lang
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
    setCurrent(rows[0] ?? null);
  }

  function openChapter(cid: number) {
    nav(`/novel/${novelId}/chapter/${cid}`);
    console.log("Opening chapter:", cid);
    // Note: route change remounts; loadCurrent will run again
  }

  function deleteChapter(cid: number) {
    (async () => {
      const db = await initDb();
      await db.execute("DELETE FROM chapters WHERE id = ?", [cid]);
      await loadChapters(db);
      setMsg("Chapter deleted.");
    })().catch(e => setMsg("Delete error: " + String(e)));
  }

  return (
    <div className="reader-layout">
      <aside className="reader-sidebar">
        <div className="reader-sidebar-header">
          <Link to="/" className="btn btn-ghost small">← Library</Link>
          <Link to={`/novel/${novelId}`} className="btn btn-ghost small">← Novel</Link>
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

              {/* Delete Button */}
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
            <p>No content for this chapter yet.</p>
          </div>
        ) : (
          <article className="reader-article">
            <div>
              <h1 className="reader-title">{current.title || "Untitled chapter"}</h1>
              <Link to={`/novel/${novelId}/editor/${chId}`} className="btn small">Edit Chapter</Link>
            </div>
            <div className="reader-meta">Variant: {current.variant_type} • Lang: {current.lang}</div>
            <div className="reader-content">{current.content}</div>
          </article>
        )}
      </main>
    </div>
  );
}
