import type { Id, EpochSeconds, LanguageCode, ChapterVariantType } from "./common";

export interface ChapterVariant {
  id: Id;
  chapter_id: Id;
  variant_type: ChapterVariantType;  // RAW | OFFICIAL | MTL | AI | HUMAN
  lang: LanguageCode;                // e.g., 'en'
  title?: string | null;
  content: string;
  source_url?: string | null;
  provider?: string | null;          // 'deepl' | 'google' | 'fan' | etc.
  model_name?: string | null;        // for AI variants
  is_primary: boolean;               // DB: 0/1 → model: boolean
  created_at: EpochSeconds;
  updated_at: EpochSeconds;
}

export interface NewChapterVariant {
  chapter_id: Id;
  variant_type: ChapterVariantType;
  lang: LanguageCode;
  title?: string | null;
  content: string;
  source_url?: string | null;
  provider?: string | null;
  model_name?: string | null;
  is_primary?: boolean;              // default false
}

export interface ChapterVariantRow
  extends Omit<ChapterVariant, "is_primary"> {
  is_primary: number;                // raw DB integer
}

export const ChapterVariantMapper = {
  fromRow(row: ChapterVariantRow): ChapterVariant {
    return {
      ...row,
      is_primary: !!row.is_primary,
    };
  },
  toInsertParams(v: NewChapterVariant): any[] {
    // matches:
    // INSERT INTO chapter_variants(chapter_id, variant_type, lang, title, content, source_url, provider, model_name, is_primary)
    // VALUES(?,?,?,?,?,?,?,?,?)
    return [
      v.chapter_id,
      v.variant_type,
      v.lang,
      v.title ?? null,
      v.content,
      v.source_url ?? null,
      v.provider ?? null,
      v.model_name ?? null,
      v.is_primary ? 1 : 0,
    ];
  },
};
