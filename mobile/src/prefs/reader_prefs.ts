// src/prefs/reader_prefs.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "reader_prefs_v1";

export type ReaderPrefs = {
  fontFamily?: string | null;
  fontSize?: number;                 // px
  lineHeight?: number | "default";   // px or "default"
};

const DEFAULTS: ReaderPrefs = {
  fontFamily: null,
  fontSize: 16,
  lineHeight: "default",
};

export async function getReaderPrefs(): Promise<ReaderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as ReaderPrefs;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Merge-and-save (only provided keys are updated). */
export async function updateReaderPrefs(patch: Partial<ReaderPrefs>): Promise<void> {
  try {
    const current = await getReaderPrefs();
    const next: ReaderPrefs = { ...current, ...patch };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore transient write errors
  }
}
