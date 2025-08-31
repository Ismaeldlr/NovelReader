import { useEffect, useMemo, useRef, useState } from "react";
import CoverSearchModal from "./CoverSearchModal"; // <-- usa tu modal existente

export type NovelStatus = string;

export type EditNovelPayload = {
  id: number;
  title: string;
  author?: string | null;
  description?: string | null;
  cover_path?: string | null;
  lang_original?: string | null;
  status?: NovelStatus | null;
};

type EditNovelModalProps = {
  open: boolean;
  initial?: EditNovelPayload | null;
  onClose: () => void;
  onSubmit: (data: EditNovelPayload) => Promise<void> | void;
  statusOptions?: Array<{ value: NovelStatus; label: string }>;
};

export function EditNovelModal({
  open,
  initial,
  onClose,
  onSubmit,
  statusOptions
}: EditNovelModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [id, setId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [coverPath, setCoverPath] = useState<string>("");
  const [langOriginal, setLangOriginal] = useState<string>("");
  const [status, setStatus] = useState<NovelStatus>("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // estado del buscador de portadas
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);

  // Reset + prefill al abrir
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);

    setId(initial?.id ?? null);
    setTitle(initial?.title ?? "");
    setAuthor(initial?.author ?? "");
    setDescription(initial?.description ?? "");
    setCoverPath(initial?.cover_path ?? "");
    setLangOriginal(initial?.lang_original ?? "");
    setStatus(initial?.status ?? "");
    setCoverSearchOpen(false);
  }, [open, initial]);

  // Cerrar con ESC / click afuera (sin cerrar si está abierto CoverSearchModal)
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

  // Mostrar preview sólo si parece URL/ruta válida
  const coverLooksLikeUrl = useMemo(() => {
    if (!coverPath) return false;
    try {
      new URL(coverPath);
      return true;
    } catch {
      return /^\/|^\.\.?\//.test(coverPath);
    }
  }, [coverPath]);

  // Query por defecto para el buscador (título + autor)
  const defaultCoverQuery = useMemo(
    () => [title.trim(), author.trim()].filter(Boolean).join(" ") || "novel cover",
    [title, author]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (id == null) {
      setError("Invalid novel id.");
      return;
    }

    const t = title.trim();
    if (!t) return setError("Title is required.");
    if (t.length > 200) return setError("Title is too long (max 200 chars).");

    const a = author.trim();
    const d = description.trim();
    const c = coverPath.trim();
    const l = langOriginal.trim();
    const s = (status ?? "").toString().trim();

    if (a.length > 200) return setError("Author is too long (max 200 chars).");
    if (d.length > 5000) return setError("Description is too long (max 5000 chars).");
    if (l && l.length > 20) return setError("Language code looks too long.");

    try {
      setSubmitting(true);
      await onSubmit({
        id,
        title: t,
        author: a || null,
        description: d || null,
        cover_path: c || null,
        lang_original: l || null,
        status: s ? (s as NovelStatus) : null
      });
      // el padre debe cerrarnos en éxito
    } catch (err) {
      setSubmitting(false);
      setError("Failed to save changes: " + String(err));
    }
  }

  if (!open) return null;

  return (
    <div
      className="library-edit-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-edit-modal-title"
    >
      <div className="library-edit-modal" ref={modalRef}>
        <header className="library-edit-modal-header">
          <h2 id="library-edit-modal-title">Edit Novel</h2>
          <button
            className="library-edit-modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <form className="library-edit-form" onSubmit={handleSubmit}>
          <div className="library-edit-grid">
            {/* Left column */}
            <div className="library-edit-col">
              <div className="library-edit-form-row">
                <label className="library-edit-label">ID</label>
                <input className="library-edit-input" type="text" value={id ?? ""} readOnly />
              </div>

              <div className="library-edit-form-row">
                <label className="library-edit-label">
                  Title <span className="req">*</span>
                </label>
                <input
                  className="library-edit-input"
                  type="text"
                  placeholder="Novel title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="library-edit-form-row">
                <label className="library-edit-label">Author</label>
                <input
                  className="library-edit-input"
                  type="text"
                  placeholder="Author name"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </div>

              <div className="library-edit-form-row">
                <label className="library-edit-label">Original Language</label>
                <select
                  value={langOriginal}
                  onChange={(e) => setLangOriginal(e.target.value)}
                  className="library-edit-input"
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                  <option value="ko">Korean</option>
                  <option value="ja">Japanese</option>
                  <option value="es">Spanish</option>
                </select>
              </div>

              <div className="library-edit-form-row">
                <label className="library-edit-label">Status</label>
                {statusOptions?.length ? (
                  <select
                    className="library-edit-input"
                    value={status ?? ""}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">— Select —</option>
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="library-edit-input"
                    type="text"
                    placeholder="e.g., ongoing, completed, hiatus"
                    value={status ?? ""}
                    onChange={(e) => setStatus(e.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="library-edit-col">
              <div className="library-edit-form-row">
                <label className="library-edit-label">Cover (URL or path)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input
                    className="library-edit-input"
                    type="text"
                    placeholder="https://example.com/cover.jpg"
                    value={coverPath}
                    onChange={(e) => setCoverPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="library-edit-btn"
                    onClick={() => setCoverSearchOpen(true)}
                  >
                    Search cover
                  </button>
                </div>
              </div>

              {coverLooksLikeUrl && (
                <div
                  className="library-edit-cover-preview"
                  style={{ cursor: "pointer" }}
                  onClick={() => setCoverSearchOpen(true)}
                  title="Click to change cover"
                >
                  <div className="library-edit-cover-frame">
                    <img
                      src={coverPath}
                      alt="Cover preview"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <span className="library-edit-cover-note">Preview (click to change)</span>
                </div>
              )}

              <div className="library-edit-form-row">
                <label className="library-edit-label">Description</label>
                <textarea
                  className="library-edit-textarea"
                  placeholder="Synopsis or notes…"
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && <p className="library-edit-error">{error}</p>}

          <div className="library-edit-actions">
            <button
              type="button"
              className="library-edit-btn ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="library-edit-btn primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Modal de búsqueda de portadas */}
      <CoverSearchModal
        open={coverSearchOpen}
        initialQuery={defaultCoverQuery}
        onClose={() => setCoverSearchOpen(false)}
        onSelect={(url: string) => {
          setCoverPath(url);
          setCoverSearchOpen(false);
        }}
      />
    </div>
  );
}
