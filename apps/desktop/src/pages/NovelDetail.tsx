import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { initDb } from "../db/init";

type Novel = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  lang_original: string | null;
  status: string | null;
  slug: string | null;
  created_at: number;
  updated_at: number;
};

type ChapterRow = {
  id: number;
  seq: number;
  display_title: string | null;
};

export default function NovelDetail() {
  const { id } = useParams();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [msg, setMsg] = useState("loading…");
  const did = useRef(false);

  useEffect(() => {
    if (did.current) return;
    did.current = true;
    (async () => {
      const db = await initDb();

      const n = await db.select(
        `SELECT id, title, author, description, lang_original, status, slug, created_at, updated_at FROM novels WHERE id = ${Number(id)} LIMIT 1;`
      );
      setNovel(n[0] ?? null);

      const ch = await db.select(
        `SELECT id, seq, display_title FROM chapters WHERE novel_id = ${Number(id)} ORDER BY seq ASC;`
      );
      setChapters(ch as ChapterRow[]);
      setMsg(n[0] ? "Ready" : "Not found");
    })().catch(e => setMsg("DB error: " + String(e)));
  }, [id]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>{novel ? novel.title : "Novel"}</h1>
        <div className="actions">
          <Link to="/" className="btn btn-ghost">← Back</Link>
          <span className="status">{msg}</span>
        </div>
      </header>

      {!novel ? (
        <div className="empty">
          <div className="empty-art" />
          <p>Novel not found.</p>
        </div>
      ) : (
        <>
          <section className="detail-hero">
            <div className="cover lg" aria-hidden="true">
              <div className="cover-shine" />
              <span className="cover-text">{initials(novel.title)}</span>
            </div>
            <div className="detail-meta">
              <h2 className="title">{novel.title}</h2>
              <p className="author">{novel.author || "Unknown author"}</p>
              {novel.description && <p className="desc">{novel.description}</p>}
              <div className="kv">
                <span>Original Lang:</span><b>{novel.lang_original || "—"}</b>
                <span>Status:</span><b>{novel.status || "—"}</b>
                <span>Slug:</span><b>{novel.slug || "—"}</b>
              </div>
            </div>
          </section>

          <section className="chapters">
            <h3>Chapters</h3>
            {chapters.length === 0 ? (
              <div className="empty small">
                <p>No chapters yet.</p>
                <p className="empty-sub">Import or add chapters (coming soon).</p>
              </div>
            ) : (
              <ul className="chapter-list">
                {chapters.map(c => (
                  <li key={c.id} className="chapter-item">
                    <span className="chip">#{c.seq}</span>
                    <span className="chapter-title">{c.display_title || `Chapter ${c.seq}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
