import type { Id, EpochSeconds } from "./common";

export interface Bookmark {
  id: Id;
  chapter_id: Id;
  position_pct: number;         // 0.0 .. 1.0
  device_id: string;            // non-null in DB ('' default)
  created_at: EpochSeconds;
  updated_at: EpochSeconds;
}

export interface NewBookmark {
  chapter_id: Id;
  position_pct?: number;        // default 0
  device_id?: string;           // default ''
}

export interface BookmarkRow extends Omit<Bookmark, never> {}

export const BookmarkMapper = {
  fromRow(row: BookmarkRow): Bookmark {
    return { ...row };
  },
  toInsertParams(b: NewBookmark): any[] {
    // matches: INSERT INTO bookmarks(chapter_id, position_pct, device_id) VALUES(?,?,?)
    return [b.chapter_id, b.position_pct ?? 0, b.device_id ?? ""];
  },
};
