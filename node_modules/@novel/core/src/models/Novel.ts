import type { Id, EpochSeconds, NovelStatus } from "./common";

export interface Novel {
  id: Id;
  title: string;
  author?: string | null;
  description?: string | null;
  cover_path?: string | null;     // file path or URL
  lang_original?: string | null;  // e.g., 'zh-CN'
  status?: NovelStatus | null;
  slug?: string | null;
  created_at: EpochSeconds;
  updated_at: EpochSeconds;
}

// For inserts (id auto-generated; timestamps default from DB)
export interface NewNovel {
  title: string;
  author?: string | null;
  description?: string | null;
  cover_path?: string | null;
  lang_original?: string | null;
  status?: NovelStatus | null;
  slug?: string | null;
}

// DB row shape (exactly as returned by SELECT * on SQLite)
export interface NovelRow extends Omit<Novel, never> {}

export const NovelMapper = {
  fromRow(row: NovelRow): Novel {
    return { ...row };
  },
  toInsertParams(n: NewNovel): any[] {
    // matches: INSERT INTO novels(title, author, description, cover_path, lang_original, status, slug) VALUES(?,?,?,?,?,?,?)
    return [
      n.title,
      n.author ?? null,
      n.description ?? null,
      n.cover_path ?? null,
      n.lang_original ?? null,
      n.status ?? null,
      n.slug ?? null,
    ];
  },
};
