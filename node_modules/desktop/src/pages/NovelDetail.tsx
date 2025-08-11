import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  const novelId = id;
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [msg, setMsg] = useState("loading…");
  const did = useRef(false);
  const dbRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (did.current) return;
    did.current = true;
    (async () => {
      const db = await initDb();
      dbRef.current = db;
      await loadNovel(db);
      await loadChapters(db);
      setMsg("Ready");
    })().catch(e => setMsg("DB error: " + String(e)));
  }, [novelId]);

  async function loadNovel(db: any) {
  if (!novelId) {
    setMsg("No novel id provided.");
    setNovel(null);
    return;
  }
  console.log("Trying to load novel with id:", novelId);
  const n = await db.select(
    "SELECT id, title, author, description, lang_original, status, slug, created_at, updated_at FROM novels WHERE id = $1 LIMIT 1;",
    [novelId]
    );

  console.log("Query result:", n);
  setNovel(n[0] ?? null);
}

  async function loadChapters(db: any) {
    const ch = await db.select(
      "SELECT id, seq, display_title FROM chapters WHERE novel_id = ? ORDER BY seq ASC;",
      [novelId]
    );
    setChapters(ch as ChapterRow[]);
  }

  function openFilePicker() {
    fileRef.current?.click();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking same file again later
    if (!file || !dbRef.current) return;

    const text = await readText(file);
    const name = file.name.replace(/\.[^.]+$/, "");
    try {
      // get next seq
      const maxRow = await dbRef.current.select(
        "SELECT IFNULL(MAX(seq), 0) as m FROM chapters WHERE novel_id = ?;",
        [novelId]
      );
      const nextSeq = (maxRow[0]?.m ?? 0) + 1;

      // insert chapter
      await dbRef.current.execute(
        "INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?,?,?,?)",
        [novelId, nextSeq, null, name]
      );

      // fetch new chapter id
      const chIdRow = await dbRef.current.select(
        "SELECT id FROM chapters WHERE novel_id = ? AND seq = ? LIMIT 1;",
        [novelId, nextSeq]
      );
      console.log("New chapter ID:", chIdRow[0]?.id);
      const chapterId = chIdRow[0]?.id as number;

      // insert RAW variant
      const lang = novel?.lang_original ?? "en";
      await dbRef.current.execute(
        "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
        [chapterId, "RAW", lang, name, text, null, null, null, 0]
      );

      await loadChapters(dbRef.current);
      // navigate to reader for this chapter
      nav(`/novel/${novelId}/chapter/${chapterId}`);
    } catch (err) {
      setMsg("Import error: " + String(err));
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>{novel ? novel.title : "Novel"}</h1>
        <div className="actions">
          <button className="btn" onClick={openFilePicker}>+ Add Chapter (TXT)</button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: "none" }}
            onChange={onPickFile}
          />
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
                <p className="empty-sub">Use “Add Chapter (TXT)” to import.</p>
              </div>
            ) : (
              <ul className="chapter-list">
                {chapters.map(c => (
                  <li key={c.id} className="chapter-item">
                    <Link to={`/novel/${novelId}/chapter/${c.id}`} className="chapter-link">
                      <span className="chip">#{c.seq}</span>
                      <span className="chapter-title">{c.display_title || `Chapter ${c.seq}`}</span>
                    </Link>
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

function readText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result ?? ""));
    fr.readAsText(file);
  });
}
