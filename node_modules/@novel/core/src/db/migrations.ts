// packages/core/src/db/migrations.ts

// Minimal DB interface that both RN and Tauri adapters can satisfy
export interface SqlDb {
  execute(sql: string): Promise<any>;
  select(sql: string): Promise<Array<Record<string, any>>>;
}

// v1 schema (INTEGER timestamps, no triggers)
export const MIGRATIONS: string[] = [
  `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS novels (
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
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id            INTEGER PRIMARY KEY,
    novel_id      INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    volume        INTEGER,
    display_title TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (novel_id, seq)
  );

  CREATE TABLE IF NOT EXISTS chapter_variants (
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
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id            INTEGER PRIMARY KEY,
    chapter_id    INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    position_pct  REAL NOT NULL DEFAULT 0,
    device_id     TEXT NOT NULL DEFAULT '',    
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (chapter_id, device_id)                
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_novel   ON chapters(novel_id);
  CREATE INDEX IF NOT EXISTS idx_variants_chapter ON chapter_variants(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_variants_primary ON chapter_variants(chapter_id, is_primary DESC);

  -- Auto-update updated_at (uses unixepoch(); no recursion with default settings)
  CREATE TRIGGER novels_set_updated AFTER UPDATE ON novels
  BEGIN
    UPDATE novels SET updated_at = unixepoch() WHERE id = NEW.id;
  END;

  CREATE TRIGGER chapters_set_updated AFTER UPDATE ON chapters
  BEGIN
    UPDATE chapters SET updated_at = unixepoch() WHERE id = NEW.id;
  END;

  CREATE TRIGGER variants_set_updated AFTER UPDATE ON chapter_variants
  BEGIN
    UPDATE chapter_variants SET updated_at = unixepoch() WHERE id = NEW.id;
  END;

  CREATE TRIGGER bookmarks_set_updated AFTER UPDATE ON bookmarks
  BEGIN
    UPDATE bookmarks SET updated_at = unixepoch() WHERE id = NEW.id;
  END;
  `
];

export async function applyMigrations(db: SqlDb): Promise<void> {
  const row = await db.select("PRAGMA user_version;");
  const current = (row?.[0]?.user_version as number) ?? 0;

  const splitStatements = (blob: string) => {
    // strip -- line comments
    const noLineComments = blob
      .split('\n')
      .map(line => line.trim().startsWith('--') ? '' : line)
      .join('\n');
    // strip /* ... */ block comments
    const noComments = noLineComments.replace(/\/\*[\s\S]*?\*\//g, '');

    const stmts: string[] = [];
    let acc = '';
    let inTrigger = false;

    for (const part of noComments.split(';')) {
      const piece = part.trim();
      if (!piece) continue;

      // detect CREATE TRIGGER ... BEGIN
      if (!inTrigger && /^CREATE\s+TRIGGER/i.test(piece)) {
        inTrigger = true;
        acc = piece + ';';
        continue;
      }

      if (inTrigger) {
        acc += '\n' + piece + ';';
        // trigger ends at END;
        if (/END\s*;?$/i.test(acc)) {
          stmts.push(acc);
          acc = '';
          inTrigger = false;
        }
        continue;
      }

      // normal statement
      stmts.push(piece);
    }

    return stmts;
  };

  for (let v = current; v < MIGRATIONS.length; v++) {
    const stmts = splitStatements(MIGRATIONS[v]);

    await db.execute("BEGIN IMMEDIATE;");
    try {
      for (const s of stmts) await db.execute(s);
      await db.execute(`PRAGMA user_version = ${v + 1};`);
      await db.execute("COMMIT;");
    } catch (e) {
      try { await db.execute("ROLLBACK;"); } catch {}
      throw e;
    }
  }
}

