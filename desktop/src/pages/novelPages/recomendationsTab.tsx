// src/ui/novel/RecsTab.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { initDb } from "../../db/init";

type Novel = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  cover_path: string | null;
  lang_original: string | null;
  status: string | null;
  updated_at: number;
};

export default function RecsTab({
  author,
  onOpenEdit,
  excludeId,            // optional: pass current novel id to hide it from results
}: {
  author: string | null;
  onOpenEdit: () => void;
  excludeId?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [recs, setRecs]     = useState<Novel[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setError(null);
      setRecs([]);
      if (!author) return;               // nothing to query
      setLoading(true);
      try {
        const db = await initDb();

        // Build SQL with optional excludeId
        const sqlBase =
          `SELECT id, title, author, description, cover_path, lang_original, status, updated_at
             FROM novels
            WHERE author = ?
              ${excludeId ? "AND id <> ?" : ""}
            ORDER BY updated_at DESC, id DESC;`;

        const rows = await db.select(sqlBase, excludeId ? [author, excludeId] : [author]);
        if (!alive) return;

        setRecs(rows as Novel[]);
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [author, excludeId]);

  // --- Render states ---
  if (!author) {
    return (
      <div className="recs-tab">
        <div className="empty">
          <p>Add an author to this novel to see recommendations.</p>
          <p className="empty-sub">We’ll show other books by that author from your library.</p>
          <button className="btn" onClick={onOpenEdit}>Edit Novel</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="recs-tab">
        <div className="empty small"><p>Loading recommendations…</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recs-tab">
        <div className="empty small"><p>Couldn’t load recommendations: {error}</p></div>
      </div>
    );
  }

  if (recs.length === 0) {
    return (
      <div className="recs-tab">
        <div className="empty small">
          <p>No other books by <b>{author}</b> found in your library.</p>
          <p className="empty-sub">Import another title by this author to see it here.</p>
        </div>
      </div>
    );
  }

  // --- Grid of author’s other novels (reuses your .library + .card styles) ---
  return (
    <div className="recs-tab">
      <div className="library">
        {recs.map(n => (
          <Link key={n.id} to={`/novel/${n.id}`} className="link-card">
            <article className="card library-card-container">
              <div className="cover">
                <div className="cover-shine" />
                {n.cover_path
                  ? <img src={n.cover_path} alt={n.title} className="cover-img"
                         style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"inherit"}} 
                         onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  : <span className="cover-text">{initials(n.title)}</span>}
              </div>

              <div className="meta">
                <h3 className="title" title={n.title}>{n.title}</h3>
                <p className="author">{n.author || "Unknown author"}</p>
                {n.description ? (
                  <p className="desc">{n.description}</p>
                ) : (
                  <p className="desc">No description.</p>
                )}
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}

// local helper (keeps look consistent with your cards)
function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
