import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { initDb } from "../db/init";
import { AddNovelModal } from "./modals/library_add_novel.tsx";
import { EditNovelModal, EditNovelPayload } from "./modals/library_edit_novel";

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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editing, setEditing] = useState<EditNovelPayload | null>(null);


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

  function openAddModal() {
    setIsAddOpen(true);
  }
  function closeAddModal() {
    setIsAddOpen(false);
  }

  // Modal submit handler: DB insert happens here, modal stays simple.
  async function handleAddNovelSubmit(data: {
        title: string;
        author?: string | null;
        description?: string | null;
      }) {
    const db = dbRef.current;
    if (!db) return;

    await db.execute(
      "INSERT INTO novels (title, author, description) VALUES ($1, $2, $3)",
      [data.title.trim(), data.author?.trim() || null, data.description?.trim() || null]
    );
    await loadNovels(db);
  }

  function openEditModal(n: any) {
    setIsEditOpen(true);
    setEditing({
      id: n.id,
      title: n.title,
      author: n.author ?? null,
      description: n.description ?? null,
      cover_path: n.cover_path ?? null,
      lang_original: n.lang_original ?? null,
      status: n.status ?? null
    });
  }
  function closeEditModal() {
    setIsEditOpen(false);
    setEditing(null);
  }

  // Submit handler for edit:
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
         status = $6
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
    await loadNovels(db);
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Library</h1>
        <div className="actions">
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

              <div className="library-menu-container">
                <button className="library-menu-button" onClick={() => toggleMenu(n.id)}>
                  ⋮
                </button>
                {menuOpen === n.id && (
                  <div className="library-menu">
                    <button
                      className="library-menu-item"
                      onClick={() => openEditModal(n)}
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
      <AddNovelModal
        open={isAddOpen}
        onClose={closeAddModal}
        onSubmit={async (payload) => {
          await handleAddNovelSubmit(payload);
          closeAddModal();
        }}
      />

      <EditNovelModal
        open={isEditOpen}
        initial={editing}
        onClose={closeEditModal}
        onSubmit={async (payload) => {
          await handleEditSubmit(payload);
          closeEditModal();
        }}
        // Optional: use a fixed list of statuses
        statusOptions={[
          { value: "ongoing", label: "Ongoing" },
          { value: "completed", label: "Completed" },
          { value: "hiatus", label: "Hiatus" }
        ]}
      />
    </div>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
