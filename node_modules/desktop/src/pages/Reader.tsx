import { useEffect, useMemo, useRef, useState } from "react";
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

  // --- prev/next pointers from the ordered list
  const { prev, next } = useMemo(() => {
    const idx = chapters.findIndex(c => c.id === chId);
    return {
      prev: idx > 0 ? chapters[idx - 1] : null,
      next: idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null,
    };
  }, [chapters, chId]);

  function goPrev() {
    if (prev) nav(`/novel/${novelId}/chapter/${prev.id}`);
    window.scrollTo({ top: 0 });
  }

  function goNext() {
    if (next) nav(`/novel/${novelId}/chapter/${next.id}`);
  window.scrollTo({ top: 0  });
  }

  return (
    <div className="reader-layout">
      <main className="reader-main">
        <div className="reader-status">{msg}</div>

        {/* Sticky reader nav */}
        <div className="reader-nav">
          <button
            className="pill-btn"
            onClick={goPrev}
            disabled={!prev}
            aria-disabled={!prev}
            title={prev ? (prev.display_title || `Chapter ${prev.seq}`) : "No previous chapter"}
          >
            <span className="pill-ico" aria-hidden>
              {/* « */}
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            Back
          </button>

          <Link to={`/novel/${novelId}`} className="pill-btn center">
            Chapters List
          </Link>

          <button
            className="pill-btn"
            onClick={goNext}
            disabled={!next}
            aria-disabled={!next}
            title={next ? (next.display_title || `Chapter ${next.seq}`) : "No next chapter"}
          >
            Next
            <span className="pill-ico" aria-hidden>
              {/* » */}
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
          </button>
        </div>

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

            {/* Sticky reader nav */}
            <div className="reader-nav">
              <button
                className="pill-btn"
                onClick={goPrev}
                disabled={!prev}
                aria-disabled={!prev}
                title={prev ? (prev.display_title || `Chapter ${prev.seq}`) : "No previous chapter"}
              >
                <span className="pill-ico" aria-hidden>
                  {/* « */}
                  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
                Back
              </button>

              <Link to={`/novel/${novelId}`} className="pill-btn center">
                Chapters List
              </Link>

              <button
                className="pill-btn"
                onClick={goNext}
                disabled={!next}
                aria-disabled={!next}
                title={next ? (next.display_title || `Chapter ${next.seq}`) : "No next chapter"}
              >
                Next
                <span className="pill-ico" aria-hidden>
                  {/* » */}
                  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
              </button>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
