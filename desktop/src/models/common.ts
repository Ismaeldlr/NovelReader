// Shared type aliases for clarity
export type Id = number;
export type EpochSeconds = number;           // matches INTEGER (unixepoch())
export type LanguageCode = string;           // e.g., "en", "zh-CN"

// Useful enums / unions
export type NovelStatus = "ongoing" | "completed" | "hiatus" | "dropped" | string;

export type ChapterVariantType =
  | "RAW"
  | "OFFICIAL"
  | "MTL"
  | "AI"
  | "HUMAN";
