import { useEffect, useMemo, useState } from "react";
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
      return { start, end, key: `${start}-${end}` };
    });
    return { ranges: r, maxSeq: max };
  }, [chapters]);

  // Group chapters by range for fast rendering
  const groups = useMemo(() => {
    const map = new Map<string, ChapterRow[]>();
    ranges.forEach(r => map.set(r.key, []));
    for (const c of chapters) {
      const bucket = Math.floor(Math.max(0, c.seq - 1) / RANGE_SIZE); // 0-based
      const start = bucket * RANGE_SIZE + 1;
      const end = Math.min((bucket + 1) * RANGE_SIZE, maxSeq);
      const key = `${start}-${end}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    // Ensure ascending order within each group
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.seq - b.seq);
      map.set(k, arr);
    }
    return map;
  }, [chapters, ranges, maxSeq]);

  // Show oldest range (first) open by default. Render 1 to last.
  const orderedRanges = useMemo(() => [...ranges], [ranges]);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOpenKeys(orderedRanges.length ? new Set([orderedRanges[0].key]) : new Set());
  }, [orderedRanges.length]); // reset when chapter set changes

  function toggle(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function expandAll() {
    setOpenKeys(new Set(orderedRanges.map(r => r.key)));
  }
  function collapseAll() {
    setOpenKeys(new Set());
  }

  return (
    <div className="toc-wrap accordion">
      {/* Controls */}
      <div className="toc-controls" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button className="btn-ghost" onClick={expandAll} aria-label="Expand all">Expand all</button>
        <button className="btn-ghost" onClick={collapseAll} aria-label="Collapse all">Collapse all</button>
      </div>

      {/* Accordion blocks (newest range first) */}
      <div className="toc-accordion-list" role="list">
        {orderedRanges.map((r) => {
          const key = r.key;
          const open = openKeys.has(key);
          const items = groups.get(key) ?? [];

          return (
            <section key={key} className={`toc-block ${open ? "open" : ""}`} role="listitem">
              <button
                className="toc-block-header"
                onClick={() => toggle(key)}
                aria-expanded={open}
                aria-controls={`panel-${key}`}
                title={`Toggle chapters ${r.start}–${r.end}`}
              >
                <span className="caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
                <span className="range-label">Ch. {r.start}–{r.end}</span>
                <span className="count">{items.length}</span>
              </button>

              {open && (
                <div id={`panel-${key}`} className="toc-block-body">
                  <ul className="chapter-list fancy">
                    {items.map(c => (
                      <li key={c.id} className="chapter-item">
                        <Link to={`/novel/${novelId}/chapter/${c.id}`} className="chapter-link">
                          <span className="chip">#{c.seq}</span>
                          <span className="chapter-title">{c.display_title || `Chapter ${c.seq}`}</span>
                        </Link>
                        <button
                          className="deleteButton"
                          onClick={() => onDeleteChapter(c.id)}
                          aria-label={`Delete chapter ${c.seq}`}
                          title={`Delete chapter ${c.seq}`}
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
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
