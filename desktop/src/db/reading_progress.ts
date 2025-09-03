import { initDb } from "./init";

export async function ensureReadingTables() {
  // v2 migration already creates them, but calling this ensures the DB is opened
  return initDb();
}

export function getDeviceId(): string {
  const KEY = "device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.getRandomValues(new Uint32Array(4)).join("-");
    localStorage.setItem(KEY, id);
  }
  return id;
}

export async function saveReadingProgress(novelId: number, chapterId: number, positionPct: number) {
  const db = await ensureReadingTables();
  const pct = Math.min(1, Math.max(0, positionPct));
  const device = getDeviceId();

  // per-chapter
  await db.execute(
    `INSERT INTO reading_progress (novel_id, chapter_id, position_pct, device_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
     ON CONFLICT(chapter_id, device_id) DO UPDATE SET
       position_pct = excluded.position_pct,
       updated_at   = unixepoch();`,
    [novelId, chapterId, pct, device]
  );

  // per-novel summary
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
  const db = await ensureReadingTables();
  const device = getDeviceId();
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
  const db = await ensureReadingTables();
  const device = getDeviceId();
  const rows = await db.select(
    `SELECT rp.chapter_id, rp.position_pct
       FROM reading_progress rp
      WHERE rp.novel_id = ? AND rp.device_id = ?
      ORDER BY rp.updated_at DESC
      LIMIT 1;`,
    [novelId, device]
  );
  return rows[0] as { chapter_id: number; position_pct: number } | undefined;
}

export async function getNovelProgressSummary(novelId: number) {
  const db = await ensureReadingTables();

  const totalRow = await db.select(`SELECT COUNT(*) AS n FROM chapters WHERE novel_id = ?;`, [novelId]);
  const total = Number(totalRow[0]?.n ?? 0);

  const device = getDeviceId();
  const doneRow = await db.select(
    `SELECT MAX(c.seq) AS max_seq
       FROM reading_progress rp
       JOIN chapters c ON c.id = rp.chapter_id
      WHERE rp.novel_id = ? AND rp.device_id = ? AND rp.position_pct >= 0.9;`,
    [novelId, device]
  );

  const maxSeq = Number(doneRow[0]?.max_seq ?? 0);
  const percent = total ? Math.min(1, maxSeq / total) : 0;

  return { totalChapters: total, maxReadSeq: maxSeq, percent };
}

export async function getReadMapForChapters(chapterIds: number[]) {
  if (chapterIds.length === 0) return {};
  const db = await ensureReadingTables();
  const device = getDeviceId();
  const placeholders = chapterIds.map(() => "?").join(",");

  const rows = await db.select(
    `SELECT chapter_id
       FROM reading_progress
      WHERE device_id = ?
        AND position_pct >= 0.9
        AND chapter_id IN (${placeholders});`,
    [device, ...chapterIds]
  );

  const map: Record<number, boolean> = {};
  rows.forEach((r: any) => { map[r.chapter_id] = true; });
  return map;
}
