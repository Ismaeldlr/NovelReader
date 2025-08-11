import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { initDb } from "../db/init";

type NovelRow = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
};

export default function Library() {
  const [novels, setNovels] = useState<NovelRow[]>([]);
  const [msg, setMsg] = useState("starting…");
  const did = useRef(false);
  const dbRef = useRef<any>(null);

  useEffect(() => {
    if (did.current) return;
    did.current = true;

    (async () => {
      const db = await initDb();
      dbRef.current = db;
      await loadNovels(db);
    })().catch(e => setMsg("DB error: " + String(e)));
  }, []);

  async function loadNovels(db: any) {
    const rows = await db.select(
      "SELECT id, title, author, description FROM novels ORDER BY id DESC;"
    );
    setNovels(rows as NovelRow[]);
    setMsg(`DB OK. novels count = ${rows.length}`);
  }

  async function addSampleNovel() {
    const db = dbRef.current;
    if (!db) return;
    const sampleTitle = `Novel ${Date.now()}`;
    await db.execute(
      // use $1, $2, $3 instead of ?
      "INSERT INTO novels (title, author, description) VALUES ($1, $2, $3)",
      [sampleTitle, "Unknown", "This is a sample novel entry for testing."]
    );
    await loadNovels(db);
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Library</h1>
        <div className="actions">
          <button className="btn" onClick={addSampleNovel}>+ Add Novel</button>
          <span className="status">{msg}</span>
        </div>
      </header>

      {novels.length === 0 ? (
        <div className="empty">
          <div className="empty-art" />
          <p>No novels yet.</p>
          <p className="empty-sub">Click “Add Novel” to insert a test entry.</p>
        </div>
      ) : (
        <div className="library">
          {novels.map((n) => (
            <Link key={n.id} to={`/novel/${n.id}`} className="card link-card" title={n.title}>
              <div className="cover" aria-hidden="true">
                <div className="cover-shine" />
                <span className="cover-text">{initials(n.title)}</span>
              </div>
              <div className="meta">
                <h2 className="title">{n.title}</h2>
                <p className="author">{n.author || "Unknown author"}</p>
                {n.description && <p className="desc">{n.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
