import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FinderFilters,
  defaultFinderFilters,
  findNovels,
  loadFinderFacets,
  FacetOption,
} from "../db/novel_finder";

export default function NovelFinder() {
  const [filters, setFilters] = useState<FinderFilters>(defaultFinderFilters);
  const [genres, setGenres] = useState<FacetOption[]>([]);
  const [tags, setTags] = useState<FacetOption[]>([]);
  const [folders, setFolders] = useState<FacetOption[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const PAGE = 20;

  // responsive
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 980);
  const [filtersOpen, setFiltersOpen] = useState(window.innerWidth >= 980);

  useEffect(() => {
    const onResize = () => {
      const narrow = window.innerWidth < 980;
      setIsNarrow(narrow);
      setFiltersOpen(!narrow); // auto close on narrow
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // facets
  useEffect(() => {
    (async () => {
      const f = await loadFinderFacets();
      setGenres(f.genres);
      setTags(f.tags);
      setFolders(f.folders);
    })().catch(console.error);
  }, []);

  // initial fetch
  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters() {
    setLoading(true);
    const page = await findNovels(filters, PAGE, 0);
    setResults(page);
    setOffset(page.length);
    setHasMore(page.length === PAGE);
    setLoading(false);
    if (isNarrow) setFiltersOpen(false);
  }

  async function loadMore() {
    if (!hasMore || loading) return;
    setLoading(true);
    const page = await findNovels(filters, PAGE, offset);
    setResults(prev => [...prev, ...page]);
    setOffset(offset + page.length);
    setHasMore(page.length === PAGE);
    setLoading(false);
  }

  function clearAll() {
    setFilters(defaultFinderFilters);
  }

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.q.trim()) n++;
    if (filters.status !== "all") n++;
    if (filters.releaseStatus !== "all") n++;
    if (filters.age !== "all") n++;
    if (filters.minChapters > 0) n++;
    if (filters.genres.length) n++;
    if (filters.tagsInclude.length) n++;
    if (filters.tagsExclude.length) n++;
    if (filters.folderInclude != null) n++;
    if (filters.folderExclude != null) n++;
    return n;
  }, [filters]);

  return (
    <div className="page finder-page">
      <div className="finder-toolbar">
        <h1 className="finder-title">Novel Finder</h1>
        {isNarrow && (
          <button className="btn finder-filter-toggle" onClick={() => setFiltersOpen(v => !v)}>
            {filtersOpen ? "Hide Filters" : `Filters${activeCount ? ` (${activeCount})` : ""}`}
          </button>
        )}
      </div>

      <div className={`finder-layout ${filtersOpen ? "filters-open" : ""}`}>
        {/* Sidebar / Drawer */}
        <aside className="finder-sidebar" aria-hidden={!filtersOpen && isNarrow}>
          <form
            className="finder-form"
            onSubmit={(e) => { e.preventDefault(); applyFilters(); }}
          >
            {/* Search */}
            <div className="finder-field">
              <label>Search</label>
              <input
                className="finder-input"
                placeholder="Novel name or raw name..."
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </div>

            {/* Sort */}
            <div className="finder-row2">
              <div className="finder-field">
                <label>Order by</label>
                <select
                  className="finder-input"
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                >
                  <option value="addition_date">Addition Date</option>
                  <option value="updated_at">Updated Date</option>
                  <option value="title">Title</option>
                  <option value="author">Author</option>
                  <option value="chapter_count">Chapter Count</option>
                </select>
              </div>
              <div className="finder-field">
                <label>Order</label>
                <div className="finder-seg">
                  <button
                    type="button"
                    className={filters.sortOrder === "desc" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, sortOrder: "desc" })}
                  >
                    Descending
                  </button>
                  <button
                    type="button"
                    className={filters.sortOrder === "asc" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, sortOrder: "asc" })}
                  >
                    Ascending
                  </button>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="finder-field">
              <label>Status</label>
              <div className="finder-seg">
                {(["all","ongoing","completed","hiatus","dropped"] as const).map(k => (
                  <button key={k} type="button"
                    className={filters.status === k ? "active" : ""}
                    onClick={() => setFilters({ ...filters, status: k })}>
                    {k[0].toUpperCase()+k.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Release status */}
            <div className="finder-field">
              <label>Release Status</label>
              <div className="finder-seg">
                {(["all","released","on_voting"] as const).map(k => (
                  <button key={k} type="button"
                    className={filters.releaseStatus === k ? "active" : ""}
                    onClick={() => setFilters({ ...filters, releaseStatus: k })}>
                    {k === "on_voting" ? "On Voting" : k[0].toUpperCase()+k.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Age */}
            <div className="finder-field">
              <label>Addition Age</label>
              <select
                className="finder-input"
                value={filters.age}
                onChange={(e) => setFilters({ ...filters, age: e.target.value as any })}
              >
                <option value="all">All</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="6mo">Last 6 months</option>
                <option value="12mo">Last 12 months</option>
              </select>
            </div>

            {/* Minimum chapters */}
            <div className="finder-field">
              <label>Minimum Chapters: {filters.minChapters || "Any"}</label>
              <input
                type="range"
                min={0}
                max={1000}
                step={10}
                value={filters.minChapters}
                onChange={(e) => setFilters({ ...filters, minChapters: Number(e.target.value) })}
              />
            </div>

            {/* Genres */}
            <div className="finder-field">
              <div className="finder-row2" style={{ alignItems: "end" }}>
                <label>Genre</label>
                <div className="finder-seg mini">
                  <span>Mode</span>
                  <button
                    type="button"
                    className={filters.genresMode === "and" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, genresMode: "and" })}
                  >And</button>
                  <button
                    type="button"
                    className={filters.genresMode === "or" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, genresMode: "or" })}
                  >Or</button>
                </div>
              </div>
              <div className="finder-choices">
                {genres.map(g => (
                  <label key={g.id} className="finder-choice">
                    <input
                      type="checkbox"
                      checked={filters.genres.includes(g.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...filters.genres, g.id]
                          : filters.genres.filter(id => id !== g.id);
                        setFilters({ ...filters, genres: next });
                      }}
                    />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Tags include */}
            <div className="finder-field">
              <div className="finder-row2" style={{ alignItems: "end" }}>
                <label>Tags</label>
                <div className="finder-seg mini">
                  <span>Mode</span>
                  <button
                    type="button"
                    className={filters.tagsMode === "and" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, tagsMode: "and" })}
                  >And</button>
                  <button
                    type="button"
                    className={filters.tagsMode === "or" ? "active" : ""}
                    onClick={() => setFilters({ ...filters, tagsMode: "or" })}
                  >Or</button>
                </div>
              </div>
              <select
                className="finder-input"
                multiple
                size={6}
                value={filters.tagsInclude.map(String)}
                onChange={(e) => {
                  const v = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                  setFilters({ ...filters, tagsInclude: v });
                }}
              >
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Tags exclude */}
            <div className="finder-field">
              <label>Tags Exclude</label>
              <select
                className="finder-input"
                multiple
                size={4}
                value={filters.tagsExclude.map(String)}
                onChange={(e) => {
                  const v = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                  setFilters({ ...filters, tagsExclude: v });
                }}
              >
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Folders include/exclude */}
            <div className="finder-field">
              <label>Library Folders</label>
              <select
                className="finder-input"
                value={filters.folderInclude ?? ""}
                onChange={(e) => setFilters({ ...filters, folderInclude: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">No-Filter</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            <div className="finder-field">
              <label>Library Exclude</label>
              <select
                className="finder-input"
                value={filters.folderExclude ?? ""}
                onChange={(e) => setFilters({ ...filters, folderExclude: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">None</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            {/* Actions */}
            <div className="finder-actions">
              <button type="button" className="btn-ghost finder-btn" onClick={clearAll}>Clear</button>
              <button type="submit" className="btn finder-btn">Apply Filters</button>
            </div>
          </form>
        </aside>

        {/* Results */}
        <section className="finder-results">
          {loading && results.length === 0 ? (
            <div className="empty"><div className="empty-art" /><p>Searching…</p></div>
          ) : results.length === 0 ? (
            <div className="empty"><div className="empty-art" /><p>No results.</p></div>
          ) : (
            <div className="finder-list">
              {results.map(n => (
                <article key={n.id} className="card finder-card">
                  <Link to={`/novel/${n.id}`} className="cover lg">
                    <div className="cover-shine" />
                    {n.cover_path ? (
                      <img src={n.cover_path} alt={n.title}
                           className="cover-img"
                           style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"inherit" }}
                           onError={(e)=>{(e.target as HTMLImageElement).style.display="none"}}/>
                    ) : <span className="cover-text">{initials(n.title)}</span>}
                  </Link>

                  <div className="meta finder-meta">
                    <div className="finder-title-row">
                      <h3 className="title">{n.title}</h3>
                      {n.status ? <span className="finder-badge">{n.status}</span> : null}
                    </div>
                    <p className="author">{n.author || "Unknown author"}</p>

                    <div className="finder-kv">
                      <span>Chapters</span><b>{n.chapter_count}</b>
                      <span>Added</span><b>{new Date(n.created_at*1000).toLocaleDateString()}</b>
                    </div>

                    {n.genres.length ? (
                      <div className="finder-chips">
                        {n.genres.slice(0,8).map((g:string, i:number) => <span key={i} className="finder-chip">{g}</span>)}
                      </div>
                    ) : null}

                    {n.description ? <p className="desc" style={{ marginTop:6 }}>{n.description}</p> : null}

                    <div className="finder-row-actions">
                      <Link className="pill-btn" to={`/novel/${n.id}`}>Details</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {hasMore && (
            <div className="finder-loadmore">
              <button className="btn" onClick={loadMore} disabled={loading}>
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* helpers */
function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map(w => w[0]?.toUpperCase() ?? "").join("");
}
