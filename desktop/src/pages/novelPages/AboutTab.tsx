import { useEffect, useState } from "react";
import { initDb } from "../../db/init";

type Chip = { id: number; name: string };

export default function AboutTab({
  novelId,
  description,
  author,
  lang,
  status,
  slug,
  createdAt,
  updatedAt,
}: {
  novelId: number;               // <-- new
  description: string | null;
  author: string | null;
  lang: string | null;
  status: string | null;
  slug: string | null;
  createdAt: number;
  updatedAt: number;
}) {
  const [genres, setGenres] = useState<Chip[]>([]);
  const [tags, setTags] = useState<Chip[]>([]);

  useEffect(() => {
    (async () => {
      const db = await initDb();

      const gs = await db.select(
        `SELECT g.id, g.name
           FROM novel_genres ng
           JOIN genres g ON g.id = ng.genre_id
          WHERE ng.novel_id = ?
          ORDER BY g.name ASC;`,
        [novelId]
      );
      setGenres(gs as Chip[]);

      const ts = await db.select(
        `SELECT t.id, t.name
           FROM novel_tags nt
           JOIN tags t ON t.id = nt.tag_id
          WHERE nt.novel_id = ?
          ORDER BY t.name ASC;`,
        [novelId]
      );
      setTags(ts as Chip[]);
    })().catch(console.error);
  }, [novelId]);

  return (
    <div className="about-tab">
      {description ? (
        <p className="desc-lg">{description}</p>
      ) : (
        <div className="empty small"><p>No description yet.</p></div>
      )}

      {/* Genres */}
      <div className="about-section">
        <h4 className="about-section-title">Genres</h4>
        {genres.length ? (
          <div className="about-chip-row">
            {genres.map(g => (
              <span key={g.id} className="about-chip">{g.name}</span>
            ))}
          </div>
        ) : (
          <p className="about-none">—</p>
        )}
      </div>

      {/* Tags */}
      <div className="about-section">
        <h4 className="about-section-title">Tags</h4>
        {tags.length ? (
          <div className="about-chip-row">
            {tags.map(t => (
              <span key={t.id} className="about-chip">{t.name}</span>
            ))}
          </div>
        ) : (
          <p className="about-none">—</p>
        )}
      </div>

      <div className="kv-grid">
        <div><span>Author</span><b>{author || "Unknown"}</b></div>
        <div><span>Status</span><b>{status || "—"}</b></div>
        <div><span>Original Language</span><b>{lang || "—"}</b></div>
        <div><span>Slug</span><b>{slug || "—"}</b></div>
        <div><span>Created</span><b>{new Date(createdAt * 1000).toLocaleString()}</b></div>
        <div><span>Updated</span><b>{new Date(updatedAt * 1000).toLocaleString()}</b></div>
      </div>
    </div>
  );
}
