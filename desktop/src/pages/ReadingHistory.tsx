import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { initDb } from "../db/init";
import { getDeviceId } from "../db/reading_progress";

type HistoryItem = {
    novelId: number;
    title: string;
    author: string | null;
    cover_path: string | null;
    status: string | null;
    last_updated: number;           // unix seconds
    chapterId: number | null;
    chapterSeq: number | null;
    chapterTitle: string | null;
    positionPct: number;            // 0..1 within chapter
    totalChapters: number;
};

const PAGE_SIZE = 30;

export default function ReadingHistory() {
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);
    const nav = useNavigate();

    useEffect(() => {
        (async () => {
            setLoading(true);
            offsetRef.current = 0;
            const first = await fetchPage(0, PAGE_SIZE);
            setItems(first);
            setHasMore(first.length === PAGE_SIZE);
            setLoading(false);
        })().catch(e => {
            console.error("History load error:", e);
            setLoading(false);
        });
    }, []);

    async function fetchPage(offset: number, limit: number): Promise<HistoryItem[]> {
        const db = await initDb();
        const device = getDeviceId();
        const rows = await db.select(
            `
      SELECT
        n.id            AS novelId,
        n.title         AS title,
        n.author        AS author,
        n.cover_path    AS cover_path,
        n.status        AS status,
        rs.updated_at   AS last_updated,
        rs.chapter_id   AS chapterId,
        rs.position_pct AS positionPct,
        c.seq           AS chapterSeq,
        c.display_title AS chapterTitle,
        totals.n_total  AS totalChapters
      FROM reading_state rs
      JOIN novels n        ON n.id = rs.novel_id
      LEFT JOIN chapters c ON c.id = rs.chapter_id
      LEFT JOIN (
        SELECT novel_id, COUNT(*) AS n_total
        FROM chapters
        GROUP BY novel_id
      ) totals ON totals.novel_id = rs.novel_id
      WHERE rs.device_id = ?
      ORDER BY rs.updated_at DESC
      LIMIT ? OFFSET ?;
      `,
            [device, limit, offset]
        );
        return (rows as any[]).map(r => ({
            novelId: r.novelId,
            title: r.title,
            author: r.author ?? null,
            cover_path: r.cover_path ?? null,
            status: r.status ?? null,
            last_updated: Number(r.last_updated ?? 0),
            chapterId: r.chapterId ?? null,
            chapterSeq: r.chapterSeq ?? null,
            chapterTitle: r.chapterTitle ?? null,
            positionPct: Number(r.positionPct ?? 0),
            totalChapters: Number(r.totalChapters ?? 0),
        }));
    }

    async function loadMore() {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        const nextOffset = offsetRef.current + PAGE_SIZE;
        const page = await fetchPage(nextOffset, PAGE_SIZE);
        setItems(prev => [...prev, ...page]);
        setHasMore(page.length === PAGE_SIZE);
        offsetRef.current = nextOffset;
        setLoadingMore(false);
    }

    async function clearNovelHistory(novelId: number) {
        if (!confirm("Clear reading history for this novel?")) return;
        const db = await initDb();
        const device = getDeviceId();
        await db.execute("DELETE FROM reading_state    WHERE novel_id = ? AND device_id = ?;", [novelId, device]);
        await db.execute("DELETE FROM reading_progress WHERE novel_id = ? AND device_id = ?;", [novelId, device]);
        setItems(prev => prev.filter(i => i.novelId !== novelId));
    }

    async function clearAllHistory() {
        if (!confirm("Clear ALL reading history for this device?")) return;
        const db = await initDb();
        const device = getDeviceId();
        await db.execute("DELETE FROM reading_state    WHERE device_id = ?;", [device]);
        await db.execute("DELETE FROM reading_progress WHERE device_id = ?;", [device]);
        setItems([]);
        setHasMore(false);
    }

    const empty = !loading && items.length === 0;

    return (
        <div className="page history-page">
            <header className="topbar history-top">
                <h1 className="history-title">Reading History</h1>
                <div className="actions history-toolbar">
                    <button className="btn btn-ghost" onClick={() => nav(-1)}>← Back</button>
                    {items.length > 0 && (
                        <button className="btn" onClick={clearAllHistory}>Clear All</button>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="empty">
                    <div className="empty-art" />
                    <p>Loading history…</p>
                </div>
            ) : empty ? (
                <div className="empty">
                    <div className="empty-art" />
                    <p>No reading history yet.</p>
                    <p className="empty-sub">Open a chapter to start tracking your progress.</p>
                    <Link to="/" className="btn" style={{ marginTop: 10 }}>Go to Library</Link>
                </div>
            ) : (
                <>
                    <div className="library history-grid">
                        {items.map(item => (
                            <article key={`${item.novelId}-${item.chapterId ?? "none"}`} className="card history-card">
                                {/* Cover */}
                                <Link to={`/novel/${item.novelId}`} className="cover" title={item.title}>
                                    <div className="cover-shine" />
                                    {item.cover_path ? (
                                        <img
                                            src={item.cover_path}
                                            alt={item.title}
                                            className="cover-img"
                                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    ) : (
                                        <span className="cover-text">{initials(item.title)}</span>
                                    )}
                                </Link>

                                {/* Meta */}
                                <div className="meta">
                                    <div className="history-meta-row">
                                        <h3 className="title" title={item.title}>{item.title}</h3>
                                        {item.status ? <span className="history-badge">{item.status}</span> : null}
                                    </div>
                                    <p className="author">{item.author || "Unknown author"}</p>

                                    <div className="desc" style={{ marginTop: 6 }}>
                                        {item.chapterSeq
                                            ? <>Last read: <b>Chapter {item.chapterSeq}</b>{item.chapterTitle ? ` — ${item.chapterTitle}` : ""}</>
                                            : <span>Not started yet</span>}
                                    </div>

                                    {/* Overall progress across the novel */}
                                    <div className="read-progress" style={{ marginTop: 8 }}>
                                        <div className="read-progress-top">
                                            <span>Progress</span>
                                            <b>
                                                {Math.max(0, item.chapterSeq ?? 0)}/{item.totalChapters || 0}
                                                {" "}({formatPercent(overallPercent(item.chapterSeq, item.totalChapters))})
                                            </b>
                                        </div>
                                        <div className="progress">
                                            <div
                                                className="progress-bar"
                                                style={{ width: `${overallPercent(item.chapterSeq, item.totalChapters) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Updated / in-chapter position */}
                                    <div className="history-updated">
                                        {typeof item.positionPct === "number" && item.chapterSeq
                                            ? <>In chapter: {formatPercent(item.positionPct)} • {relativeTime(item.last_updated)}</>
                                            : <>Updated {relativeTime(item.last_updated)}</>}
                                    </div>

                                    <div className="history-actions">
                                        <Link
                                            className="pill-btn"
                                            to={item.chapterId ? `/novel/${item.novelId}/chapter/${item.chapterId}` : `/novel/${item.novelId}`}
                                            title={item.chapterId ? "Continue reading" : "Open novel"}
                                        >
                                            ▶ {item.chapterId ? "Continue" : "Open"}
                                        </Link>

                                        {/* add history-btn + danger */}
                                        <button className="btn-ghost history-btn danger" onClick={() => clearNovelHistory(item.novelId)}>
                                            Clear
                                        </button>

                                        {/* add history-btn to remove underline + sizing */}
                                        <Link className="btn-ghost history-btn" to={`/novel/${item.novelId}`}>
                                            Details
                                        </Link>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>

                    {hasMore && (
                        <div className="history-loadmore">
                            <button className="btn" onClick={loadMore} disabled={loadingMore}>
                                {loadingMore ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ===================== Helpers ===================== */
function initials(title: string) {
    const words = title.trim().split(/\s+/).slice(0, 2);
    return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
function overallPercent(seq: number | null, total: number | null) {
    if (!seq || !total || total <= 0) return 0;
    return Math.min(1, seq / total);
}
function formatPercent(p: number) { return `${Math.round((p || 0) * 100)}%`; }
function relativeTime(unixSeconds: number) {
    if (!unixSeconds) return "just now";
    const diffMs = Date.now() - unixSeconds * 1000;
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.round(hr / 24);
    if (d < 7) return `${d}d ago`;
    const dt = new Date(unixSeconds * 1000);
    return dt.toLocaleDateString();
}
