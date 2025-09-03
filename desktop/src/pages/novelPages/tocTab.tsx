import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type ChapterRow = { id: number; seq: number; display_title: string | null };

const RANGE_SIZE = 100;

export default function TocTab({
  novelId,
  chapters,
  onDeleteChapter,
}: {
  novelId: string;
  chapters: ChapterRow[];
  onDeleteChapter: (chapterId: number) => void;
}) {
  if (chapters.length === 0) {
    return (
      <div className="empty small">
        <p>No chapters yet.</p>
        <p className="empty-sub">Use “Add Chapter” → Empty / TXT / EPUB.</p>
      </div>
    );
  }

  // Precompute ranges like [{start:1,end:100}, {start:101,end:200}, ...]
  const { ranges, maxSeq } = useMemo(() => {
    const max = chapters.reduce((m, c) => Math.max(m, c.seq || 0), 0);
    const count = Math.max(1, Math.ceil(max / RANGE_SIZE));
    const r = Array.from({ length: count }, (_, i) => {
      const start = i * RANGE_SIZE + 1;
      const end = Math.min((i + 1) * RANGE_SIZE, max);
      return { start, end };
    });
    return { ranges: r, maxSeq: max };
  }, [chapters]);

  // Default to the last range (most recent chapters) if there are many
  const [rangeIndex, setRangeIndex] = useState(() => Math.max(0, ranges.length - 1));

  const active = ranges[rangeIndex] ?? { start: 1, end: maxSeq };
  const visible = useMemo(
    () => chapters.filter(c => c.seq >= active.start && c.seq <= active.end),
    [chapters, active.start, active.end]
  );

  return (
    <div className="toc-wrap">
      {/* Range selector */}
      <div className="toc-ranges">
        <button
          className="mini-nav"
          onClick={() => setRangeIndex(i => Math.max(0, i - 1))}
          disabled={rangeIndex === 0}
          aria-label="Previous range"
        >
          ◀
        </button>

        <div className="range-scroller" role="tablist" aria-label="Chapter ranges">
          {ranges.map((r, i) => {
            const label = `${r.start}-${r.end}`;
            const isActive = i === rangeIndex;
            return (
              <button
                key={label}
                role="tab"
                aria-selected={isActive}
                className={`range-tab ${isActive ? "active" : ""}`}
                onClick={() => setRangeIndex(i)}
                title={`Chapters ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          className="mini-nav"
          onClick={() => setRangeIndex(i => Math.min(ranges.length - 1, i + 1))}
          disabled={rangeIndex === ranges.length - 1}
          aria-label="Next range"
        >
          ▶
        </button>
      </div>

      {/* Chapters for the active range */}
      <ul className="chapter-list fancy">
        {visible.map(c => (
          <li key={c.id} className="chapter-item">
            <Link to={`/novel/${novelId}/chapter/${c.id}`} className="chapter-link">
              <span className="chip">#{c.seq}</span>
              <span className="chapter-title">{c.display_title || `Chapter ${c.seq}`}</span>
            </Link>
            <button
              className="deleteButton"
              onClick={() => onDeleteChapter(c.id)}
              aria-label={`Delete chapter ${c.seq}`}
            >
              <svg viewBox="0 0 448 512" className="deleteIcon" aria-hidden="true">
                <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 
                  32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 
                  6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 
                  46.3-19.7 47.9-45L416 128z"/>
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
