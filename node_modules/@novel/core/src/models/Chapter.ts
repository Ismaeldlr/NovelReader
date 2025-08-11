import type { Id, EpochSeconds } from "./common";

export interface Chapter {
  id: Id;
  novel_id: Id;
  seq: number;                     // chapter number/order
  volume?: number | null;
  display_title?: string | null;   // fallback if no variant title
  created_at: EpochSeconds;
  updated_at: EpochSeconds;
}

export interface NewChapter {
  novel_id: Id;
  seq: number;
  volume?: number | null;
  display_title?: string | null;
}

export interface ChapterRow extends Omit<Chapter, never> {}

export const ChapterMapper = {
  fromRow(row: ChapterRow): Chapter {
    return { ...row };
  },
  toInsertParams(c: NewChapter): any[] {
    // matches: INSERT INTO chapters(novel_id, seq, volume, display_title) VALUES(?,?,?,?)
    return [c.novel_id, c.seq, c.volume ?? null, c.display_title ?? null];
  },
};
