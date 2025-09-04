import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import JSZip from "jszip";
import { initDb } from "../db/init";
import { EditNovelModal, EditNovelPayload } from "./modals/library_edit_novel";
import {
  getContinueForNovel,
  getRecentProgressInNovel,
  getNovelProgressSummary,
} from "../db/reading_progress";

// --- Sub-pages ---
import AboutTab from "./novelPages/AboutTab";
import TocTab from "./novelPages/tocTab";
import RecsTab from "./novelPages/recomendationsTab";

type Novel = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  cover_path: string | null;
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

// Simple local tabs
function Tabs({
  tabs,
  current,
  onChange,
}: {
  tabs: { key: string; label: string; badge?: number | null }[];
  current: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`tab ${current === t.key ? "active" : ""}`}
          aria-current={current === t.key ? "page" : undefined}
        >
          {t.label}
          {typeof t.badge === "number" ? (
            <span className="tab-badge">{t.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export default function NovelDetail() {
  const { id } = useParams();
  const novelId = id; // string | undefined (we'll Number() where needed)
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);

  // NEW: reading progress / continue
  const [continueTo, setContinueTo] = useState<{ chapterId: number; pct: number } | null>(null);
  const [progress, setProgress] = useState<{ totalChapters: number; maxReadSeq: number; percent: number } | null>(null);

  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [addOpen, setAddOpen] = useState<boolean>(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editing, setEditing] = useState<EditNovelPayload | null>(null);
  const [tab, setTab] = useState<"about" | "toc" | "recs">("about");

  const did = useRef(false);
  const dbRef = useRef<any>(null);
  const txtRef = useRef<HTMLInputElement>(null);
  const epubRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  // ------------ INIT: open DB + load novel/chapters ------------
  useEffect(() => {
    if (did.current) return;
    did.current = true;
    (async () => {
      const db = await initDb();
      dbRef.current = db;
      await loadNovel(db);
      await loadChapters(db);
    })().catch(e => console.error("DB error: " + String(e)));
  }, [novelId]);

  // ------------ Load continue pointer + progress summary ------------
  useEffect(() => {
    if (!novelId) return;
    (async () => {
      // Continue pointer (fast), fallback to most recent progress in this novel
      const cont =
        (await getContinueForNovel(Number(novelId))) ??
        (await getRecentProgressInNovel(Number(novelId)));
      setContinueTo(cont ? { chapterId: cont.chapter_id, pct: cont.position_pct } : null);

      // Overall progress
      const p = await getNovelProgressSummary(Number(novelId));
      setProgress(p);
    })().catch(console.error);
    // Recompute when chapter count changes (e.g., import/delete)
  }, [novelId, chapters.length]);

  async function loadNovel(db: any) {
    if (!novelId) {
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

  function toggleMenu() { setMenuOpen((v) => !v); }

  // ------------ ADD MENU ACTIONS ------------
  async function onAddEmpty() {
    if (!dbRef.current || !novelId) return;
    try {
      const nextSeq = await nextSeqForNovel();
      const name = `Chapter ${nextSeq}`;
      await dbRef.current.execute(
        "INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?,?,?,?)",
        [novelId, nextSeq, null, name]
      );
      const chId = await getChapterIdBySeq(nextSeq);
      const lang = novel?.lang_original ?? "en";
      await dbRef.current.execute(
        "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
        [chId, "RAW", lang, name, "", null, null, null, 0]
      );
      await loadChapters(dbRef.current);
      nav(`/novel/${novelId}/chapter/${chId}`);
    } catch (e) {
      console.error("Create error: " + String(e));
    } finally {
      setAddOpen(false);
    }
  }

  function openTxtPicker() { txtRef.current?.click(); }
  function openEpubPicker() { epubRef.current?.click(); }

  async function onPickTxt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !dbRef.current) return;

    try {
      const text = await readText(file);
      const name = file.name.replace(/\.[^.]+$/, "");
      const chId = await insertChapterWithContent(name, text);
      await loadChapters(dbRef.current);
      nav(`/novel/${novelId}/chapter/${chId}`);
    } catch (err) {
      console.error("Import error: " + String(err));
    } finally {
      setAddOpen(false);
    }
  }

  async function onPickEpub(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !dbRef.current) return;

    try {
      const { chapters: parsed } = await parseEpub(file);
      const clean = parsed.filter((ch) => {
        const t = (ch.title || "").toLowerCase();
        const badTitle = /(cover|table of contents|contents|toc|copyright|title page)/i.test(t);
        const isInformation = t.trim() === "information";
        const tooShort = (ch.text || "").replace(/\s+/g, " ").trim().length < 60;
        return !badTitle && !isInformation && !tooShort;
      });

      if (!clean.length) {
        console.error("No readable chapters found in EPUB.");
        return;
      }

      const startSeq = await nextSeqForNovel();
      let seq = startSeq;
      const lang = novel?.lang_original ?? "en";

      for (const ch of clean) {
        const title = ch.title?.trim() || `Chapter ${seq}`;
        await dbRef.current.execute(
          "INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?,?,?,?)",
          [novelId, seq, null, title]
        );
        const chId = await getChapterIdBySeq(seq);
        await dbRef.current.execute(
          "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
          [chId, "RAW", lang, title, ch.text, null, "epub", null, 0]
        );
        seq++;
      }

      await loadChapters(dbRef.current);
      console.log(`Imported ${clean.length} chapter(s).`);
    } catch (err) {
      console.error("EPUB error: " + String(err));
    } finally {
      setAddOpen(false);
    }
  }

  // ------------ DELETE / REMOVE ------------
  async function deleteChapter(cid: number) {
    try {
      const db = dbRef.current ?? (await initDb());
      await db.execute("DELETE FROM chapters WHERE id = ?", [cid]);
      await loadChapters(db);
      console.log("Chapter deleted.");
    } catch (e) {
      console.error("Delete error: " + String(e));
    }
  }

  async function removeNovel(nid: number) {
    try {
      const db = dbRef.current ?? (await initDb());
      await db.execute("DELETE FROM novels WHERE id = ?", [nid]);
      console.log("Novel removed.");
      nav("/");
    } catch (e) {
      console.error("Remove error: " + String(e));
    }
  }

  // ------------ EDIT MODAL ------------
  function openEditModal(n: Novel) {
    setEditing({
      id: n.id,
      title: n.title,
      author: n.author ?? null,
      description: n.description ?? null,
      cover_path: n.cover_path ?? null,
      lang_original: n.lang_original ?? null,
      status: n.status ?? null,
    });
    setIsEditOpen(true);
    setMenuOpen(false);
  }
  function closeEditModal() { setIsEditOpen(false); setEditing(null); }

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
        data.id,
      ]
    );
    await loadNovel(db);
  }

  // ------------ EPUB HELPERS ------------
  async function nextSeqForNovel() {
    const maxRow = await dbRef.current.select(
      "SELECT IFNULL(MAX(seq), 0) as m FROM chapters WHERE novel_id = ?;",
      [novelId]
    );
    return (maxRow[0]?.m ?? 0) + 1;
  }

  async function getChapterIdBySeq(seq: number) {
    const row = await dbRef.current.select(
      "SELECT id FROM chapters WHERE novel_id = ? AND seq = ? LIMIT 1;",
      [novelId, seq]
    );
    return row[0]?.id as number;
  }

  async function insertChapterWithContent(name: string, text: string) {
    const nextSeq = await nextSeqForNovel();
    await dbRef.current.execute(
      "INSERT INTO chapters (novel_id, seq, volume, display_title) VALUES (?,?,?,?)",
      [novelId, nextSeq, null, name]
    );
    const chId = await getChapterIdBySeq(nextSeq);
    const lang = novel?.lang_original ?? "en";
    await dbRef.current.execute(
      "INSERT INTO chapter_variants (chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary) VALUES (?,?,?,?,?,?,?,?,?)",
      [chId, "RAW", lang, name, text, null, null, null, 0]
    );
    return chId;
  }

  // ------------ RENDER ------------
  return (
    <div className="page novel-detail">
      <header
        className="topbar"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <h1>{novel ? novel.title : "Novel"}</h1>
        <div className="actions" style={{ position: "relative" }}>
          <button className="btn" onClick={() => setAddOpen((v) => !v)}>+ Add Chapter</button>

          {addOpen && (
            <div className="menu-pop">
              <button className="library-menu-item" onClick={onAddEmpty}>Empty</button>
              <button className="library-menu-item" onClick={openTxtPicker}>Import TXT</button>
              <button className="library-menu-item" onClick={openEpubPicker}>Import EPUB</button>
            </div>
          )}

          <input ref={txtRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={onPickTxt} />
          <input ref={epubRef} type="file" accept=".epub,application/epub+zip" style={{ display: "none" }} onChange={onPickEpub} />

          <Link to="/" className="btn btn-ghost">← Back</Link>
        </div>
      </header>

      {!novel ? (
        <div className="empty">
          <div className="empty-art" />
          <p>Novel not found.</p>
        </div>
      ) : (
        <>
          {/* --------- HERO --------- */}
          <section className="detail-hero fancy">
            <div className="cover lg" aria-hidden="true">
              <div className="cover-shine" />
              {novel.cover_path ? (
                <img
                  src={novel.cover_path}
                  alt={novel.title}
                  className="cover-img"
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <span className="cover-text">{initials(novel.title)}</span>
              )}

              <div className="library-menu-container">
                <button className="library-menu-button" onClick={toggleMenu} aria-expanded={menuOpen} aria-haspopup="menu">⋮</button>
                {menuOpen && (
                  <div className="library-menu" role="menu">
                    <button className="library-menu-item" onClick={() => openEditModal(novel)} role="menuitem">Edit</button>
                    <button className="library-menu-item" onClick={() => removeNovel(novel.id)} role="menuitem">Remove from Library</button>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-meta">
              <div className="title-row">
                <h2 className="title">{novel.title}</h2>
                <span className="status-chip">{novel.status || "—"}</span>
              </div>
              <p className="author">{novel.author || "Unknown author"}</p>

              {progress && (
                <div className="read-progress">
                  <div className="read-progress-top">
                    <span>Progress</span>
                    <b>
                      {progress.maxReadSeq}/{progress.totalChapters} ({Math.round(progress.percent * 100)}%)
                    </b>
                  </div>
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${progress.percent * 100}%` }} />
                  </div>
                </div>
              )}

              <div className="meta-kpis">
                <div className="kpi"><span className="kpi-top">Chapters</span><b>{chapters.length}</b></div>
                <div className="kpi"><span className="kpi-top">Original Lang</span><b>{novel.lang_original || "—"}</b></div>
                <div className="kpi"><span className="kpi-top">Slug</span><b>{novel.slug || "—"}</b></div>
                <div className="kpi"><span className="kpi-top">Updated</span><b>{new Date((novel.updated_at ?? 0) * 1000).toLocaleDateString()}</b></div>
              </div>

              {continueTo && (
                <div style={{ marginTop: 10 }}>
                  <Link
                    className="pill-btn"
                    to={`/novel/${novel.id}/chapter/${continueTo.chapterId}`}
                    title="Continue reading"
                  >
                    ▶ Continue reading
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* --------- TABS --------- */}
          <Tabs
            tabs={[
              { key: "about", label: "About" },
              { key: "toc", label: "Table of Contents", badge: chapters.length },
              { key: "recs", label: "Recommendations" },
            ]}
            current={tab}
            onChange={(k) => setTab(k as typeof tab)}
          />

          {/* --------- TAB CONTENT --------- */}
          <section className="tab-body">
            {tab === "about" && (
              <AboutTab
                novelId={novel.id}
                description={novel.description}
                author={novel.author}
                lang={novel.lang_original}
                status={novel.status}
                slug={novel.slug}
                createdAt={novel.created_at}
                updatedAt={novel.updated_at}
              />
            )}

            {tab === "toc" && (
              <TocTab
                novelId={String(novel.id)}
                chapters={chapters}
                onDeleteChapter={deleteChapter}
              />
            )}

            {tab === "recs" && (
              <RecsTab
                author={novel.author}
                excludeId={novel.id}
                onOpenEdit={() => openEditModal(novel)}
              />
            )}
          </section>

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
              { value: "hiatus", label: "Hiatus" },
            ]}
          />
        </>
      )}
    </div>
  );
}

/* ===================== Helpers ===================== */
function initials(title: string) {
  const words = title.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function readText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result ?? ""));
    fr.readAsText(file);
  });
}
function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(fr.result as ArrayBuffer);
    fr.readAsArrayBuffer(file);
  });
}

type ParsedChapter = { href: string; title: string; text: string };
async function parseEpub(file: File): Promise<{ chapters: ParsedChapter[] }> {
  const zip = await JSZip.loadAsync(await readArrayBuffer(file));
  const container = await zip.file("META-INF/container.xml")?.async("text");
  if (!container) throw new Error("Invalid EPUB: missing META-INF/container.xml");

  const parser = new DOMParser();
  const cdoc = parser.parseFromString(container, "application/xml");
  const rootfile = cdoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!rootfile) throw new Error("Invalid EPUB: missing rootfile path");

  const opfText = await zip.file(rootfile)?.async("text");
  if (!opfText) throw new Error("Invalid EPUB: OPF not found");
  const opf = parser.parseFromString(opfText, "application/xml");

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  opf.querySelectorAll("manifest > item").forEach((it) => {
    const id = it.getAttribute("id") || "";
    manifest.set(id, {
      href: it.getAttribute("href") || "",
      type: it.getAttribute("media-type") || "",
      props: it.getAttribute("properties") || "",
    });
  });

  const spineIds = Array.from(opf.querySelectorAll("spine > itemref"))
    .map((n) => n.getAttribute("idref") || "")
    .filter(Boolean);

  const basePath = rootfile.split("/").slice(0, -1).join("/");

  const chapters: ParsedChapter[] = [];
  for (const id of spineIds) {
    const meta = manifest.get(id);
    if (!meta) continue;

    const isNav = /\bnav\b/i.test(meta.props);
    const isNcx = /application\/x-dtbncx\+xml/i.test(meta.type);
    const isHtml = /x?html/i.test(meta.type) || /\.x?html?$/i.test(meta.href);
    if (isNav || isNcx || !isHtml) continue;

    const path = resolvePath(basePath, meta.href);
    const htmlText = await zip.file(path)?.async("text");
    if (!htmlText) continue;

    const htmlWithBreaks = htmlText.replace(/<br\s*\/?>/gi, "\n");
    const doc = parser.parseFromString(htmlWithBreaks, "text/html");
    const title = doc.querySelector("h1,h2,h3,title")?.textContent?.trim() || "";
    const text = htmlToText(doc);
    chapters.push({ href: meta.href, title, text });
  }
  return { chapters };
}

function htmlToText(doc: Document) {
  const blocks = doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,div,section,article,figure");
  const lines = Array.from(blocks).map((el) => (el.textContent || "").trim()).filter(Boolean);
  let text = lines.join("\n\n");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}
function resolvePath(base: string, href: string) {
  if (!base) return href;
  const stack = base.split("/").filter(Boolean);
  for (const seg of href.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}
