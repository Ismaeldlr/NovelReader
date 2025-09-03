import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { initDb } from "../db/init";
import { saveReadingProgress } from "../db/reading_progress";

type ChapterListItem = { id: number; seq: number; display_title: string | null };
type ChapterVariant = { id: number; title: string | null; content: string; variant_type: string; lang: string };

export default function Reader() {
  const { id, chapterId } = useParams();
  const novelId = Number(id);
  const chId = Number(chapterId);

  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
  const [current, setCurrent] = useState<ChapterVariant | null>(null);

  const dbRef = useRef<any>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const trackingRef = useRef(false);

  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const db = await initDb();
      dbRef.current = db;
      await loadChapters(db);
      await loadCurrent(db, chId);
    })().catch(e => console.error("DB error: " + String(e)));
  }, [novelId, chId]);

  async function loadChapters(db: any) {
    const rows = await db.select(
      "SELECT id, seq, display_title FROM chapters WHERE novel_id = ? ORDER BY seq ASC;",
      [novelId]
    );
    setChapters(rows as ChapterListItem[]);
  }

  async function loadCurrent(db: any, chapterIdNum: number) {
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

  const { prev, next } = useMemo(() => {
    const idx = chapters.findIndex(c => c.id === chId);
    return {
      prev: idx > 0 ? chapters[idx - 1] : null,
      next: idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null,
    };
  }, [chapters, chId]);

  // ---- helper: flush progress now
  const flushNow = async () => {
    const el = scrollerRef.current;
    if (!el) return;
    const denom = Math.max(1, el.scrollHeight - el.clientHeight);
    const pct = el.scrollTop / denom;
    await saveReadingProgress(novelId, chId, pct);
  };

  // ---- Restore & start tracking; also mark chapter as "visited" immediately
  useEffect(() => {
    if (!current) return;
    let cancelled = false;

    (async () => {
      try {
        // Let layout settle then read any saved position from DB (Reader already does that)
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (cancelled) return;

        const el = scrollerRef.current;
        if (el) {
          // We don’t know pct here without a select; just restore to top and start tracking.
          // Immediately save 0% so reading_state points to this chapter even if user leaves right away.
          el.scrollTop = 0;
        }

        // Mark this chapter as the latest visited (0%) so “Continue” isn’t one behind
        await saveReadingProgress(novelId, chId, 0);
        trackingRef.current = true;
      } catch (e) {
        console.error("Restore progress error:", e);
        trackingRef.current = true;
      }
    })();

    // On unmount, flush once
    return () => {
      cancelled = true;
      trackingRef.current = false;
      flushNow().catch(() => {});
    };
  }, [current, chId, novelId]);

  // ---- Debounced save on scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      if (!trackingRef.current) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const denom = Math.max(1, el.scrollHeight - el.clientHeight);
        const pct = el.scrollTop / denom;
        saveReadingProgress(novelId, chId, pct).catch(console.error);
      }, 300);
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [novelId, chId]);

  // ---- Nav that also persists current position
  function goPrev() {
    if (!prev) return;
    flushNow().finally(() => {
      nav(`/novel/${novelId}/chapter/${prev.id}`);
      window.scrollTo({ top: 0 });
    });
  }
  function goNext() {
    if (!next) return;
    // If you're near the end and tap Next, you can force 100% for the current one:
    // saveReadingProgress(novelId, chId, 1).finally(...)
    flushNow().finally(() => {
      nav(`/novel/${novelId}/chapter/${next.id}`);
      window.scrollTo({ top: 0 });
    });
  }
  function goList() {
    flushNow().finally(() => {
      nav(`/novel/${novelId}`);
    });
  }

  return (
    <div className="reader-layout">
      <main ref={scrollerRef} className="reader-main">

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
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            Back
          </button>

          {/* changed from Link to button so we can flush first */}
          <button className="pill-btn center" onClick={goList}>
            Chapters List
          </button>

          <button
            className="pill-btn"
            onClick={goNext}
            disabled={!next}
            aria-disabled={!next}
            title={next ? (next.display_title || `Chapter ${next.seq}`) : "No next chapter"}
          >
            Next
            <span className="pill-ico" aria-hidden>
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

            {/* Sticky reader nav (bottom) */}
            <div className="reader-nav">
              <button className="pill-btn" onClick={goPrev} disabled={!prev} aria-disabled={!prev}>
                <span className="pill-ico" aria-hidden>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
                Back
              </button>

              <button className="pill-btn center" onClick={goList}>
                Chapters List
              </button>

              <button className="pill-btn" onClick={goNext} disabled={!next} aria-disabled={!next}>
                Next
                <span className="pill-ico" aria-hidden>
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
