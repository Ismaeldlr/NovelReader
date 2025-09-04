// reading_progress.ts (mobile / React Native)
import { initDb } from "./index"; // was "./init"
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

// Prefer a stable per-install ID. AsyncStorage is sufficient for app scope.
// If you want a system-provided stable ID, you can also use expo-application's getInstallIdAsync().
const DEVICE_ID_KEY = "device_id";

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // Use Crypto.randomUUID() if available; otherwise make a UUID-ish string
    id = (Crypto as any).randomUUID?.() ??
         Array.from(new Uint8Array(await Crypto.getRandomBytesAsync(16)))
              .map(b => b.toString(16).padStart(2, "0"))
              .join("");
    await AsyncStorage.setItem(DEVICE_ID_KEY, id ?? "");
  }
  return id ?? "";
}

async function getDb() {
  // initDb runs migrations (v2 ensures reading_* tables exist)
  return initDb();
}

export async function saveReadingProgress(novelId: number, chapterId: number, positionPct: number) {
  const db = await getDb();
  const pct = Math.min(1, Math.max(0, positionPct));
  const device = await getDeviceId();

  await db.execute(
    `INSERT INTO reading_progress (novel_id, chapter_id, position_pct, device_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
     ON CONFLICT(chapter_id, device_id) DO UPDATE SET
       position_pct = excluded.position_pct,
       updated_at   = unixepoch();`,
    [novelId, chapterId, pct, device]
  );

  await db.execute(
    `INSERT INTO reading_state (novel_id, chapter_id, position_pct, device_id, updated_at)
     VALUES (?, ?, ?, ?, unixepoch())
     ON CONFLICT(novel_id, device_id) DO UPDATE SET
       chapter_id   = excluded.chapter_id,
       position_pct = excluded.position_pct,
       updated_at   = unixepoch();`,
    [novelId, chapterId, pct, device]
  );
}

export async function getContinueForNovel(novelId: number) {
  const db = await getDb();
  const device = await getDeviceId();
  const rows = await db.select(
    `SELECT chapter_id, position_pct
       FROM reading_state
      WHERE novel_id = ? AND device_id = ?
      LIMIT 1;`,
    [novelId, device]
  );
  return rows[0] as { chapter_id: number; position_pct: number } | undefined;
}

export async function getRecentProgressInNovel(novelId: number) {
  const db = await getDb();
  const device = await getDeviceId();
  const rows = await db.select(
    `SELECT chapter_id, position_pct
       FROM reading_progress
      WHERE novel_id = ? AND device_id = ?
      ORDER BY updated_at DESC
      LIMIT 1;`,
    [novelId, device]
  );
  return rows[0] as { chapter_id: number; position_pct: number } | undefined;
}

export async function getNovelProgressSummary(novelId: number) {
  const db = await initDb();
  const totalRow = await db.select(`SELECT COUNT(*) AS n FROM chapters WHERE novel_id = ?;`, [novelId]);
  const total = Number(totalRow[0]?.n ?? 0);

  const device = await getDeviceId();

  const stateRow = await db.select(
    `SELECT c.seq AS seq
       FROM reading_state rs
       JOIN chapters c ON c.id = rs.chapter_id
      WHERE rs.novel_id = ? AND rs.device_id = ?
      LIMIT 1;`,
    [novelId, device]
  );
  let lastSeq = Number(stateRow?.[0]?.seq ?? 0);

  if (!lastSeq) {
    const maxRow = await db.select(
      `SELECT MAX(c.seq) AS max_seq
         FROM reading_progress rp
         JOIN chapters c ON c.id = rp.chapter_id
        WHERE rp.novel_id = ? AND rp.device_id = ?;`,
      [novelId, device]
    );
    lastSeq = Number(maxRow?.[0]?.max_seq ?? 0);
  }

  const percent = total ? Math.min(1, lastSeq / total) : 0;
  return { totalChapters: total, maxReadSeq: lastSeq, percent };
}

export async function getReadMapForChapters(chapterIds: number[]) {
  if (chapterIds.length === 0) return {};
  const db = await getDb();
  const device = await getDeviceId();
  const placeholders = chapterIds.map(() => "?").join(",");
  const rows = await db.select(
    `SELECT chapter_id
       FROM reading_progress
      WHERE device_id = ?
        AND position_pct >= 0.9
        AND chapter_id IN (${placeholders});`,
    [device, ...chapterIds]
  );
  const m: Record<number, boolean> = {};
  rows.forEach((r: any) => { m[r.chapter_id] = true; });
  return m;
}
