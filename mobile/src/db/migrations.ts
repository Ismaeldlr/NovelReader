// src/db/migrations.ts
export const MIGRATIONS: string[] = [
  // PRAGMAs first (best effort; harmless if re-run)
  `PRAGMA foreign_keys = ON`,

  // tables
  `CREATE TABLE IF NOT EXISTS novels (
    id            INTEGER PRIMARY KEY,
    title         TEXT NOT NULL,
    author        TEXT,
    description   TEXT,
    cover_path    TEXT,
    lang_original TEXT,
    status        TEXT,
    slug          TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
  )`,

  `CREATE TABLE IF NOT EXISTS chapters (
    id            INTEGER PRIMARY KEY,
    novel_id      INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    volume        INTEGER,
    display_title TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (novel_id, seq)
  )`,

  `CREATE TABLE IF NOT EXISTS chapter_variants (
    id            INTEGER PRIMARY KEY,
    chapter_id    INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    variant_type  TEXT NOT NULL,
    lang          TEXT NOT NULL,
    title         TEXT,
    content       TEXT NOT NULL,
    source_url    TEXT,
    provider      TEXT,
    model_name    TEXT,
    is_primary    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (chapter_id, variant_type, lang)
  )`,

  `CREATE TABLE IF NOT EXISTS bookmarks (
    id            INTEGER PRIMARY KEY,
    chapter_id    INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    position_pct  REAL NOT NULL DEFAULT 0,
    device_id     TEXT NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (chapter_id, device_id)
  )`,

  // indexes
  `CREATE INDEX IF NOT EXISTS idx_chapters_novel   ON chapters(novel_id)`,
  `CREATE INDEX IF NOT EXISTS idx_variants_chapter ON chapter_variants(chapter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_variants_primary ON chapter_variants(chapter_id, is_primary DESC)`,

  // triggers (idempotent in SQLite; CREATE TRIGGER IF NOT EXISTS exists only on 3.35+,
  // so we recreate via DROP+CREATE sequence if you ever need to change them in later migrations)
  `CREATE TRIGGER IF NOT EXISTS novels_set_updated AFTER UPDATE ON novels
   BEGIN
     UPDATE novels SET updated_at = unixepoch() WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS chapters_set_updated AFTER UPDATE ON chapters
   BEGIN
     UPDATE chapters SET updated_at = unixepoch() WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS variants_set_updated AFTER UPDATE ON chapter_variants
   BEGIN
     UPDATE chapter_variants SET updated_at = unixepoch() WHERE id = NEW.id;
   END`,

  `CREATE TRIGGER IF NOT EXISTS bookmarks_set_updated AFTER UPDATE ON bookmarks
   BEGIN
     UPDATE bookmarks SET updated_at = unixepoch() WHERE id = NEW.id;
   END`,
];

// src/db/applyMigrations.ts
export async function applyMigrations(
  db: { execute: (sql: string, params?: any[]) => Promise<any> },
  migrations: string[]
) {
  // schema version table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _schema_version(
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )
  `);
  // get current version
  const rows = await (db as any).select?.(`SELECT version FROM _schema_version WHERE id = 1`) ?? [];
  let current = rows?.[0]?.version ?? 0;

  // run remaining migrations in a transaction
  if (current < migrations.length) {
    // If your db has withTransaction, prefer it. Otherwise best-effort loop:
    for (let i = current; i < migrations.length; i++) {
      const sql = migrations[i].trim();
      if (!sql) continue;
      await db.execute(sql);
      await db.execute(
        rows.length
          ? `UPDATE _schema_version SET version = ? WHERE id = 1`
          : `INSERT OR REPLACE INTO _schema_version(id, version) VALUES (1, ?)`,
        [i + 1]
      );
    }
  }
}
