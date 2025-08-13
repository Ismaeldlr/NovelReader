import { useEffect, useRef, useState, useCallback } from "react";
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
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Add Novel form state
  const [formTitle, setFormTitle] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const did = useRef(false);
  const dbRef = useRef<any>(null);
  const addModalRef = useRef<HTMLDivElement | null>(null);

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

  async function removeNovel(id: number) {
    const db = dbRef.current;
    if (!db) return;
    await db.execute("DELETE FROM novels WHERE id = ?", [id]);
    await loadNovels(db);
    setMenuOpen(null);
  }

  function toggleMenu(id: number) {
    setMenuOpen(menuOpen === id ? null : id);
  }

  // Open/close Add modal
  const openAddModal = () => {
    setFormTitle("");
    setFormAuthor("");
    setFormDesc("");
    setFormError(null);
    setIsAddOpen(true);
  };
  const closeAddModal = useCallback(() => {
    setIsAddOpen(false);
    setFormError(null);
  }, []);

  // Close on ESC and click outside
  useEffect(() => {
    if (!isAddOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAddModal();
    };
    const onClickOutside = (e: MouseEvent) => {
      if (
        addModalRef.current &&
        e.target instanceof Node &&
        !addModalRef.current.contains(e.target)
      ) {
        closeAddModal();
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [isAddOpen, closeAddModal]);

  async function handleAddNovelSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const title = formTitle.trim();
    const author = formAuthor.trim();
    const description = formDesc.trim();

    if (!title) {
      setFormError("Title is required.");
      return;
    }
    if (title.length > 200) {
      setFormError("Title is too long (max 200 chars).");
      return;
    }
    if (author.length > 200) {
      setFormError("Author is too long (max 200 chars).");
      return;
    }
    if (description.length > 2000) {
      setFormError("Description is too long (max 2000 chars).");
      return;
    }

    const db = dbRef.current;
    if (!db) return;

    try {
      setIsSaving(true);
      await db.execute(
        "INSERT INTO novels (title, author, description) VALUES ($1, $2, $3)",
        [title, author || null, description || null]
      );
      await loadNovels(db);
      setIsSaving(false);
      setIsAddOpen(false);
    } catch (err) {
      setIsSaving(false);
      setFormError("Failed to save novel: " + String(err));
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Library</h1>
        <div className="actions">
          {/* Replaces old addSampleNovel */}
          <button className="btn" onClick={openAddModal}>+ Add Novel</button>
          <span className="status">{msg}</span>
        </div>
      </header>

      {novels.length === 0 ? (
        <div className="empty">
          <div className="empty-art" />
          <p>No novels yet.</p>
          <p className="empty-sub">Click “Add Novel” to insert a new entry.</p>
        </div>
      ) : (
        <div className="library">
          {novels.map((n) => (
            <div key={n.id} className="library-card-container">
              <Link to={`/novel/${n.id}`} className="card link-card" title={n.title}>
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

              {/* menu (already namespaced) */}
              <div className="library-menu-container">
                <button className="library-menu-button" onClick={() => toggleMenu(n.id)}>
                  ⋮
                </button>
                {menuOpen === n.id && (
                  <div className="library-menu">
                    <button
                      className="library-menu-item"
                      onClick={() => alert("Edit feature coming soon!")}
                    >
                      Edit
                    </button>
                    <button
                      className="library-menu-item"
                      onClick={() => removeNovel(n.id)}
                    >
                      Remove from Library
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Novel Modal */}
      {isAddOpen && (
        <div
          className="library-add-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-add-modal-title"
        >
          <div className="library-add-modal" ref={addModalRef}>
            <header className="library-add-modal-header">
              <h2 id="library-add-modal-title">Add Novel</h2>
              <button
                className="library-add-modal-close"
                aria-label="Close"
                onClick={closeAddModal}
              >
                ×
              </button>
            </header>

            <form className="library-add-form" onSubmit={handleAddNovelSubmit}>
              <div className="library-add-form-row">
                <label htmlFor="add-title" className="library-add-label">Title<span className="req">*</span></label>
                <input
                  id="add-title"
                  className="library-add-input"
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="library-add-form-row">
                <label htmlFor="add-author" className="library-add-label">Author</label>
                <input
                  id="add-author"
                  className="library-add-input"
                  type="text"
                  value={formAuthor}
                  onChange={(e) => setFormAuthor(e.target.value)}
                />
              </div>

              <div className="library-add-form-row">
                <label htmlFor="add-desc" className="library-add-label">Description</label>
                <textarea
                  id="add-desc"
                  className="library-add-textarea"
                  placeholder="Brief synopsis, notes, or anything you want to remember."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={6}
                />
              </div>

              {formError && <p className="library-add-error">{formError}</p>}

              <div className="library-add-actions">
                <button
                  type="button"
                  className="library-add-btn ghost"
                  onClick={closeAddModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="library-add-btn primary"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving…" : "Add Novel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
