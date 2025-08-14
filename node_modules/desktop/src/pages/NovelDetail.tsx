import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { initDb } from "../db/init";
import { EditNovelModal, EditNovelPayload } from "./modals/library_edit_novel";

type Novel = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  cover_path: string | null;      // added to match edit modal
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

  const [menuOpen, setMenuOpen] = useState<boolean>(false); // simple toggle for this page
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editing, setEditing] = useState<EditNovelPayload | null>(null);

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
    const n = await db.select(
      `SELECT id, title, author, description, cover_path, lang_original, status, slug, created_at, updated_at
       FROM novels WHERE id = $1 LIMIT 1;`,
      [novelId]
    );
    setNovel(n[0] ?? null);
  }

  async function loadChapters(db: any) {
    const ch = await db.select(
      "SELECT id, seq, display_title FROM chapters WHERE novel_id = ? ORDER BY seq ASC;",
      [novelId]
    );
    setChapters(ch as ChapterRow[]);
  }

  function toggleMenu() {
    setMenuOpen(v => !v);
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
      const chapterId = chIdRow[0]?.id as number;

      // insert RAW variant
      const lang = novel?.lang_original ?? "en";
      await dbRef.current.execute(
        "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
        [chapterId, "RAW", lang, name, text, null, null, null, 0]
      );

      await loadChapters(dbRef.current);
      nav(`/novel/${novelId}/chapter/${chapterId}`);
    } catch (err) {
      setMsg("Import error: " + String(err));
    }
  }

  async function deleteChapter(cid: number) {
    try {
      const db = dbRef.current ?? (await initDb());
      await db.execute("DELETE FROM chapters WHERE id = ?", [cid]);
      await loadChapters(db);
      setMsg("Chapter deleted.");
    } catch (e) {
      setMsg("Delete error: " + String(e));
    }
  }

  async function removeNovel(nid: number) {
    try {
      const db = dbRef.current ?? (await initDb());
      await db.execute("DELETE FROM novels WHERE id = ?", [nid]);
      setMsg("Novel removed.");
      nav("/");
    } catch (e) {
      setMsg("Remove error: " + String(e));
    }
  }

  function openEditModal(n: Novel) {
    setEditing({
      id: n.id,
      title: n.title,
      author: n.author ?? null,
      description: n.description ?? null,
      cover_path: n.cover_path ?? null,
      lang_original: n.lang_original ?? null,
      status: n.status ?? null
    });
    setIsEditOpen(true);
    setMenuOpen(false);
  }

  function closeEditModal() {
    setIsEditOpen(false);
    setEditing(null);
  }

  async function handleEditSubmit(data: EditNovelPayload) {
    const db = dbRef.current;
    if (!db) return;

    await db.execute(
      `UPDATE novels
       SET title = $1,
           author = $2,
           description = $3,
           cover_path = $4,
           lang_original = $5,
           status = $6,
           updated_at = CAST(strftime('%s','now') AS INTEGER)
       WHERE id = $7`,
      [
        data.title.trim(),
        data.author ?? null,
        data.description ?? null,
        data.cover_path ?? null,
        data.lang_original ?? null,
        data.status ?? null,
        data.id
      ]
    );
    await loadNovel(db);
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

              {/* Page-local menu (names already namespaced) */}
              <div className="library-menu-container">
                <button
                  className="library-menu-button"
                  onClick={toggleMenu}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  ⋮
                </button>
                {menuOpen && (
                  <div className="library-menu" role="menu">
                    <button
                      className="library-menu-item"
                      onClick={() => openEditModal(novel)}
                      role="menuitem"
                    >
                      Edit
                    </button>
                    <button
                      className="library-menu-item"
                      onClick={() => removeNovel(novel.id)}
                      role="menuitem"
                    >
                      Remove from Library
                    </button>
                  </div>
                )}
              </div>
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
                    <Link
                      to={`/novel/${novelId}/chapter/${c.id}`}
                      className="chapter-link"
                    >
                      <span className="chip">#{c.seq}</span>
                      <span className="chapter-title">
                        {c.display_title || `Chapter ${c.seq}`}
                      </span>
                    </Link>

                    {/* Delete Button */}
                    <button
                      className="deleteButton"
                      onClick={() => deleteChapter(c.id)}
                    >
                      <svg viewBox="0 0 448 512" className="deleteIcon">
                        <path d="M135.2 17.7L128 32H32C14.3 32 0 
                          46.3 0 64S14.3 96 32 96H416c17.7 0 
                          32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 
                          6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 
                          6.8-28.6 17.7zM416 128H32L53.2 467c1.6 
                          25.3 22.6 45 47.9 45H346.9c25.3 0 
                          46.3-19.7 47.9-45L416 128z"></path>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Edit Novel Modal (reusing existing component) */}
          <EditNovelModal
            open={isEditOpen}
            initial={editing}
            onClose={closeEditModal}
            onSubmit={async (payload) => {
              await handleEditSubmit(payload);
              closeEditModal();
            }}
            statusOptions={[
              { value: "ongoing", label: "Ongoing" },
              { value: "completed", label: "Completed" },
              { value: "hiatus", label: "Hiatus" }
            ]}
          />
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