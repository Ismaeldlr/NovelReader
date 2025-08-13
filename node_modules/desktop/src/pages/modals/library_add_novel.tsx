import { useEffect, useMemo, useRef, useState } from "react";

export type NovelStatus = string; // tighten if you have a union elsewhere

export type AddNovelPayload = {
  title: string;
  author?: string | null;
  description?: string | null;
  cover_path?: string | null;
  lang_original?: string | null;  // e.g., "zh-CN"
  status?: NovelStatus | null;
};

type AddNovelModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddNovelPayload) => Promise<void> | void;

  /** Optional: provide status options for a dropdown */
  statusOptions?: Array<{ value: NovelStatus; label: string }>;
};

export function AddNovelModal({
  open,
  onClose,
  onSubmit,
  statusOptions
}: AddNovelModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [langOriginal, setLangOriginal] = useState("");
  const [status, setStatus] = useState<NovelStatus>("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setTitle("");
      setAuthor("");
      setDescription("");
      setCoverPath("");
      setLangOriginal("");
      setStatus("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // ESC to close + click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
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
  }, [open, onClose]);

  // Simple URL-ish check to decide whether to render a preview
  const coverLooksLikeUrl = useMemo(() => {
    if (!coverPath) return false;
    try {
      new URL(coverPath); // absolute URL OK
      return true;
    } catch {
      return /^\/|^\.\.?\//.test(coverPath); // allow /path or ./path
    }
  }, [coverPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const t = title.trim();
    const a = author.trim();
    const d = description.trim();
    const c = coverPath.trim();
    const l = langOriginal.trim();
    const s = (status ?? "").toString().trim();

    if (!t) {
      setError("Title is required.");
      return;
    }
    if (t.length > 200) {
      setError("Title is too long (max 200 chars).");
      return;
    }
    if (a.length > 200) {
      setError("Author is too long (max 200 chars).");
      return;
    }
    if (d.length > 5000) {
      setError("Description is too long (max 5000 chars).");
      return;
    }
    if (l && l.length > 20) {
      setError("Language code looks too long.");
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        title: t,
        author: a || null,
        description: d || null,
        cover_path: c || null,
        lang_original: l || null,
        status: s ? (s as NovelStatus) : null
      });
      // parent closes on success
    } catch (err) {
      setSubmitting(false);
      setError("Failed to save novel: " + String(err));
      return;
    }
  }

  if (!open) return null;

  return (
    <div
      className="library-add-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-add-modal-title"
    >
      <div className="library-add-modal" ref={modalRef}>
        <header className="library-add-modal-header">
          <h2 id="library-add-modal-title">Add Novel</h2>
          <button
            className="library-add-modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        {/* Keep structure the same: stacked rows, just added new inputs */}
        <form className="library-add-form" onSubmit={handleSubmit}>
          <div className="library-add-form-row">
            <label htmlFor="add-title" className="library-add-label">
              Title <span className="req">*</span>
            </label>
            <input
              id="add-title"
              className="library-add-input"
              type="text"
              placeholder="e.g., Split Worlds: The Rise of the Martial Mage"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              placeholder="e.g., Ismael de la Rosa"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          <div className="library-add-form-row">
            <label htmlFor="add-lang" className="library-add-label">Original Language</label>
            <input
              id="add-lang"
              className="library-add-input"
              type="text"
              placeholder="e.g., zh-CN"
              value={langOriginal}
              onChange={(e) => setLangOriginal(e.target.value)}
            />
          </div>

          <div className="library-add-form-row">
            <label htmlFor="add-status" className="library-add-label">Status</label>
            {statusOptions?.length ? (
              <select
                id="add-status"
                className="library-add-input"
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
                id="add-status"
                className="library-add-input"
                type="text"
                placeholder="e.g., ongoing, completed, hiatus"
                value={status ?? ""}
                onChange={(e) => setStatus(e.target.value)}
              />
            )}
          </div>

          <div className="library-add-form-row">
            <label htmlFor="add-cover" className="library-add-label">Cover (URL or path)</label>
            <input
              id="add-cover"
              className="library-add-input"
              type="text"
              placeholder="https://example.com/cover.jpg"
              value={coverPath}
              onChange={(e) => setCoverPath(e.target.value)}
            />
          </div>

          {coverLooksLikeUrl && (
            <div className="library-add-form-row">
              <div className="library-edit-cover-preview">
                <div className="library-edit-cover-frame">
                  <img
                    src={coverPath}
                    alt="Cover preview"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="library-edit-cover-note">Preview</span>
              </div>
            </div>
          )}

          <div className="library-add-form-row">
            <label htmlFor="add-desc" className="library-add-label">Description</label>
            <textarea
              id="add-desc"
              className="library-add-textarea"
              placeholder="Brief synopsis, notes, or anything you want to remember."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
            />
          </div>

          {error && <p className="library-add-error">{error}</p>}

          <div className="library-add-actions">
            <button
              type="button"
              className="library-add-btn ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="library-add-btn primary"
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Add Novel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
