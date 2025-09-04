// finder.ts
import { initDb } from "./index"; // was "./init"

export type MatchMode = "and" | "or";
export type SortBy = "addition_date" | "updated_at" | "title" | "author" | "chapter_count";
export type SortOrder = "asc" | "desc";
export type Age = "all" | "24h" | "7d" | "30d" | "6mo" | "12mo";

export type FinderFilters = {
  q: string;
  status: "all" | "ongoing" | "completed" | "hiatus" | "dropped";
  releaseStatus: "all" | "released" | "on_voting";
  age: Age;
  minChapters: number;
  genres: number[];
  genresMode: MatchMode;
  tagsInclude: number[];
  tagsMode: MatchMode;
  tagsExclude: number[];
  folderInclude: number | null;
  folderExclude: number | null;
  sortBy: SortBy;
  sortOrder: SortOrder;
};

export const defaultFinderFilters: FinderFilters = {
  q: "",
  status: "all",
  releaseStatus: "all",
  age: "all",
  minChapters: 0,
  genres: [],
  genresMode: "or",
  tagsInclude: [],
  tagsMode: "or",
  tagsExclude: [],
  folderInclude: null,
  folderExclude: null,
  sortBy: "addition_date",
  sortOrder: "desc",
};

export type FacetOption = { id: number; name: string; slug?: string };

export async function loadFinderFacets() {
  const db = await initDb();
  const genres = (await db.select("SELECT id, name, slug FROM genres ORDER BY name ASC;")) as FacetOption[];
  const tags   = (await db.select("SELECT id, name, slug FROM tags   ORDER BY name ASC;")) as FacetOption[];
  const folders= (await db.select("SELECT id, name FROM folders ORDER BY sort ASC, name ASC;")) as FacetOption[];
  return { genres, tags, folders };
}

export type FinderResult = {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  cover_path: string | null;
  status: string | null;
  release_status: string | null;
  created_at: number;
  updated_at: number;
  chapter_count: number;
  genres: string[];
  tags: string[];
};

export async function findNovels(filters: FinderFilters, limit = 25, offset = 0): Promise<FinderResult[]> {
  const db = await initDb();
  const where: string[] = [];
  const params: any[] = [];

  if (filters.q.trim()) {
    const like = `%${filters.q.trim()}%`;
    where.push("(n.title LIKE ? OR n.author LIKE ? OR n.slug LIKE ?)");
    params.push(like, like, like);
  }

  if (filters.status !== "all") { where.push("n.status = ?"); params.push(filters.status); }
  if (filters.releaseStatus !== "all") { where.push("n.release_status = ?"); params.push(filters.releaseStatus); }

  const ageToSeconds: Record<Age, number> = {
    all: 0, "24h": 86400, "7d": 604800, "30d": 2592000, "6mo": 15811200, "12mo": 31536000
  };
  const ageSec = ageToSeconds[filters.age] || 0;
  if (ageSec > 0) { where.push("n.created_at >= (unixepoch() - ?)"); params.push(ageSec); }

  if (filters.minChapters > 0) { where.push("(s.chapter_count >= ?)"); params.push(filters.minChapters); }

  if (filters.genres.length) {
    if (filters.genresMode === "and") {
      where.push(`n.id IN (
        SELECT ng.novel_id
        FROM novel_genres ng
        WHERE ng.genre_id IN (${placeholders(filters.genres.length)})
        GROUP BY ng.novel_id
        HAVING COUNT(DISTINCT ng.genre_id) = ${filters.genres.length}
      )`);
      params.push(...filters.genres);
    } else {
      where.push(`EXISTS (
        SELECT 1 FROM novel_genres ng
        WHERE ng.novel_id = n.id AND ng.genre_id IN (${placeholders(filters.genres.length)})
      )`);
      params.push(...filters.genres);
    }
  }

  if (filters.tagsInclude.length) {
    if (filters.tagsMode === "and") {
      where.push(`n.id IN (
        SELECT nt.novel_id
        FROM novel_tags nt
        WHERE nt.tag_id IN (${placeholders(filters.tagsInclude.length)})
        GROUP BY nt.novel_id
        HAVING COUNT(DISTINCT nt.tag_id) = ${filters.tagsInclude.length}
      )`);
      params.push(...filters.tagsInclude);
    } else {
      where.push(`EXISTS (
        SELECT 1 FROM novel_tags nt
        WHERE nt.novel_id = n.id AND nt.tag_id IN (${placeholders(filters.tagsInclude.length)})
      )`);
      params.push(...filters.tagsInclude);
    }
  }

  if (filters.tagsExclude.length) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM novel_tags nt
      WHERE nt.novel_id = n.id AND nt.tag_id IN (${placeholders(filters.tagsExclude.length)})
    )`);
    params.push(...filters.tagsExclude);
  }

  if (filters.folderInclude != null) {
    where.push(`EXISTS (SELECT 1 FROM novel_folders nf WHERE nf.novel_id = n.id AND nf.folder_id = ?)`);
    params.push(filters.folderInclude);
  }
  if (filters.folderExclude != null) {
    where.push(`NOT EXISTS (SELECT 1 FROM novel_folders nf WHERE nf.novel_id = n.id AND nf.folder_id = ?)`);
    params.push(filters.folderExclude);
  }

  const orderMap: Record<SortBy, string> = {
    addition_date: "n.created_at",
    updated_at: "n.updated_at",
    title: "n.title COLLATE NOCASE",
    author: "n.author COLLATE NOCASE",
    chapter_count: "s.chapter_count"
  };
  const orderExpr = orderMap[filters.sortBy] || "n.created_at";
  const dir = filters.sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const sql = `
    SELECT
      n.id, n.title, n.author, n.description, n.cover_path,
      n.status, n.release_status, n.created_at, n.updated_at,
      IFNULL(s.chapter_count,0) AS chapter_count,
      IFNULL((
        SELECT group_concat(g.name,'|')
        FROM novel_genres ng
        JOIN genres g ON g.id = ng.genre_id
        WHERE ng.novel_id = n.id
      ), '') AS genres_csv,
      IFNULL((
        SELECT group_concat(t.name,'|')
        FROM novel_tags nt
        JOIN tags t ON t.id = nt.tag_id
        WHERE nt.novel_id = n.id
      ), '') AS tags_csv
    FROM novels n
    LEFT JOIN novel_stats s ON s.novel_id = n.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${orderExpr} ${dir}
    LIMIT ? OFFSET ?;
  `;

  const rows = await db.select(sql, [...params, limit, offset]);
  return (rows as any[]).map(r => ({
    id: r.id,
    title: r.title,
    author: r.author ?? null,
    description: r.description ?? null,
    cover_path: r.cover_path ?? null,
    status: r.status ?? null,
    release_status: r.release_status ?? null,
    created_at: Number(r.created_at ?? 0),
    updated_at: Number(r.updated_at ?? 0),
    chapter_count: Number(r.chapter_count ?? 0),
    genres: String(r.genres_csv || "").split("|").filter(Boolean),
    tags:   String(r.tags_csv   || "").split("|").filter(Boolean),
  }));
}

function placeholders(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}
