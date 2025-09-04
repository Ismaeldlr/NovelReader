import { useEffect, useMemo, useRef, useState } from "react";
import { initDb } from "../../db/init";              // <-- add this
import CoverSearchModal from "./CoverSearchModal";

export type NovelStatus = string;

export type AddNovelPayload = {
  title: string;
  author?: string | null;
  description?: string | null;
  cover_path?: string | null;
  lang_original?: string | null;
  status?: NovelStatus | null;

  // NEW: selections to persist in join tables
  genre_ids?: number[];
  tag_ids?: number[];
};

type AddNovelModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddNovelPayload) => Promise<void> | void;
  statusOptions?: Array<{ value: NovelStatus; label: string }>;
};

type Facet = { id: number; name: string };

export function AddNovelModal({
  open,
  onClose,
  onSubmit,
}: AddNovelModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [langOriginal, setLangOriginal] = useState("");
  const [status, setStatus] = useState<NovelStatus>("");

  // NEW: facets + selections
  const [genres, setGenres] = useState<Facet[]>([]);
  const [tags, setTags] = useState<Facet[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [tagsFilter, setTagsFilter] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [coverSearchOpen, setCoverSearchOpen] = useState(false);

  // reset fields when opened
  useEffect(() => {
    if (open) {
      setTitle("");
      setAuthor("");
      setDescription("");
      setCoverPath("");
      setLangOriginal("");
      setStatus("");
      setSelectedGenres([]);
      setSelectedTags([]);
      setTagsFilter("");
      setError(null);
      setSubmitting(false);
      setCoverSearchOpen(false);

      // load facets fresh when opening
      (async () => {
        try {
          const db = await initDb();
          const gs = await db.select("SELECT id, name FROM genres ORDER BY name ASC;");
          const ts = await db.select("SELECT id, name FROM tags   ORDER BY name ASC;");
          setGenres(gs as Facet[]);
          setTags(ts as Facet[]);
        } catch (e) {
          console.error("Load facets error:", e);
        }
      })();
    }
  }, [open]);

  // esc / outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (coverSearchOpen) setCoverSearchOpen(false);
        else onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (coverSearchOpen) return;
      if (modalRef.current && e.target instanceof Node && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, coverSearchOpen]);

  const coverLooksLikeUrl = useMemo(() => {
    if (!coverPath) return false;
    try { new URL(coverPath); return true; }
    catch { return /^\/|^\.\.?\//.test(coverPath); }
  }, [coverPath]);

  // filtered tags for the multi-select
  const filteredTags = useMemo(() => {
    const q = tagsFilter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(t => t.name.toLowerCase().includes(q));
  }, [tags, tagsFilter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const t = title.trim();
    const a = author.trim();
    const d = description.trim();
    const c = coverPath.trim();
    const l = langOriginal.trim();
    const s = (status ?? "").toString().trim();

    if (!t) return setError("Title is required.");
    if (t.length > 200) return setError("Title too long.");
    if (a.length > 200) return setError("Author too long.");
    if (d.length > 5000) return setError("Description too long.");

    try {
      setSubmitting(true);
      await onSubmit({
        title: t,
        author: a || null,
        description: d || null,
        cover_path: c || null,
        lang_original: l || null,
        status: s ? (s as NovelStatus) : null,
        genre_ids: selectedGenres,     // NEW
        tag_ids: selectedTags,         // NEW
      });
    } catch (err) {
      setSubmitting(false);
      return setError("Failed: " + String(err));
    }
  }

  if (!open) return null;

  const defaultCoverQuery =
    [title.trim(), author.trim()].filter(Boolean).join(" ") || "novel cover";

  return (
    <div className="library-add-modal-overlay" role="dialog" aria-modal="true">
      <div className="library-add-modal" ref={modalRef}>
        <header className="library-add-modal-header">
          <h2>Add Novel</h2>
          <button className="library-add-modal-close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </header>

        <form className="library-add-form" onSubmit={handleSubmit}>
          {/* Title */}
          <div className="library-add-form-row">
            <label className="library-add-label">Title *</label>
            <input
              className="library-add-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Author */}
          <div className="library-add-form-row">
            <label className="library-add-label">Author</label>
            <input
              className="library-add-input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          {/* Lang */}
          <div className="library-add-form-row">
            <label className="library-add-label">Original Language</label>
            <select
              className="library-add-input"
              value={langOriginal}
              onChange={(e) => setLangOriginal(e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="ko">Korean</option>
              <option value="ja">Japanese</option>
              <option value="es">Spanish</option>
            </select>
          </div>

          {/* Status */}
          <div className="library-add-form-row">
            <label className="library-add-label">Status</label>
            <select
              className="library-add-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="hiatus">Hiatus</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>

          {/* Cover */}
          <div className="library-add-form-row">
            <label className="library-add-label">Cover</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                className="library-add-input"
                value={coverPath}
                onChange={(e) => setCoverPath(e.target.value)}
                placeholder="https://example.com/cover.jpg"
              />
              <button
                type="button"
                className="library-add-btn"
                onClick={() => setCoverSearchOpen(true)}
              >
                Search cover
              </button>
            </div>
          </div>

          {coverLooksLikeUrl && (
            <div className="library-add-form-row">
              <div
                className="library-edit-cover-preview"
                style={{ cursor: "pointer" }}
                onClick={() => setCoverSearchOpen(true)}
              >
                <div className="library-edit-cover-frame">
                  <img src={coverPath} alt="Cover" />
                </div>
                <span className="library-edit-cover-note">Preview (click to change)</span>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="library-add-form-row">
            <label className="library-add-label">Description</label>
            <textarea
              className="library-add-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
            />
          </div>

          {/* -------- NEW: Genres -------- */}
          <div className="library-add-form-row">
            <label className="library-add-label">Genres</label>
            <div className="add-choices">
              {genres.map(g => (
                <label key={g.id} className="add-choice">
                  <input
                    type="checkbox"
                    checked={selectedGenres.includes(g.id)}
                    onChange={(e) => {
                      setSelectedGenres(prev =>
                        e.target.checked ? [...prev, g.id] : prev.filter(id => id !== g.id)
                      );
                    }}
                  />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* -------- NEW: Tags (filter + multi-select) -------- */}
          <div className="library-add-form-row">
            <label className="library-add-label">Tags</label>
            <input
              className="library-add-input"
              placeholder="Filter tags…"
              value={tagsFilter}
              onChange={(e) => setTagsFilter(e.target.value)}
            />
            <select
              className="library-add-input add-tags-select"
              multiple
              size={8}
              value={selectedTags.map(String)}
              onChange={(e) => {
                const v = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                setSelectedTags(v);
              }}
            >
              {filteredTags.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="library-add-error">{error}</p>}

          <div className="library-add-actions">
            <button type="button" className="library-add-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="library-add-btn primary" disabled={submitting}>
              {submitting ? "Saving…" : "Add Novel"}
            </button>
          </div>
        </form>
      </div>

      <CoverSearchModal
        open={coverSearchOpen}
        initialQuery={defaultCoverQuery}
        onClose={() => setCoverSearchOpen(false)}
        onSelect={(url: string) => { setCoverPath(url); setCoverSearchOpen(false); }}
      />
    </div>
  );
}
