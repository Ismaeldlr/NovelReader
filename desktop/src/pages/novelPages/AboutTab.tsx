export default function AboutTab({
  description,
  author,
  lang,
  status,
  slug,
  createdAt,
  updatedAt,
}: {
  description: string | null;
  author: string | null;
  lang: string | null;
  status: string | null;
  slug: string | null;
  createdAt: number;
  updatedAt: number;
}) {
  return (
    <div className="about-tab">
      {description ? (
        <p className="desc-lg">{description}</p>
      ) : (
        <div className="empty small"><p>No description yet.</p></div>
      )}

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
