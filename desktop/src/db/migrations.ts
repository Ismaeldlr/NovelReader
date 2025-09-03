// packages/core/src/db/migrations.ts

// Minimal DB interface that both RN and Tauri adapters can satisfy
export interface SqlDb {
  execute(sql: string): Promise<any>;
  select(sql: string): Promise<Array<Record<string, any>>>;
}

// v1 schema (INTEGER timestamps, no reading tables)
export const MIGRATIONS: string[] = [
  // --------------------------- v1 ---------------------------
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
  `,

  // --------------------------- v2 (reading progress) ---------------------------
  `
  PRAGMA foreign_keys = ON;

  -- Fine-grained per-chapter progress (separate from bookmarks)
  CREATE TABLE IF NOT EXISTS reading_progress (
    id            INTEGER PRIMARY KEY,
    novel_id      INTEGER NOT NULL REFERENCES novels(id)   ON DELETE CASCADE,
    chapter_id    INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    position_pct  REAL    NOT NULL DEFAULT 0,  -- 0..1
    device_id     TEXT    NOT NULL DEFAULT '',
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (chapter_id, device_id)
  );

  -- Fast "Continue" pointer per novel
  CREATE TABLE IF NOT EXISTS reading_state (
    novel_id     INTEGER NOT NULL REFERENCES novels(id)   ON DELETE CASCADE,
    chapter_id   INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    position_pct REAL    NOT NULL DEFAULT 0,
    device_id    TEXT    NOT NULL DEFAULT '',
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (novel_id, device_id)
  );

  -- Helpful indexes
  CREATE INDEX IF NOT EXISTS idx_progress_novel_device ON reading_progress(novel_id, device_id);
  CREATE INDEX IF NOT EXISTS idx_progress_chapter      ON reading_progress(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_state_device          ON reading_state(device_id);

  -- Triggers to maintain updated_at
  CREATE TRIGGER reading_progress_set_updated AFTER UPDATE ON reading_progress
  BEGIN
    UPDATE reading_progress SET updated_at = unixepoch() WHERE id = NEW.id;
  END;

  CREATE TRIGGER reading_state_set_updated AFTER UPDATE ON reading_state
  BEGIN
    UPDATE reading_state SET updated_at = unixepoch()
    WHERE novel_id = NEW.novel_id AND device_id = NEW.device_id;
  END;

  -- Optional: backfill from bookmarks so users keep their place
  INSERT OR IGNORE INTO reading_progress (novel_id, chapter_id, position_pct, device_id, created_at, updated_at)
  SELECT c.novel_id, b.chapter_id, b.position_pct, b.device_id, b.created_at, b.updated_at
    FROM bookmarks b
    JOIN chapters  c ON c.id = b.chapter_id;

  -- Seed reading_state with the most recent bookmark per (novel, device)
  INSERT OR REPLACE INTO reading_state (novel_id, chapter_id, position_pct, device_id, updated_at)
  SELECT c.novel_id, b.chapter_id, b.position_pct, b.device_id, b.updated_at
    FROM bookmarks b
    JOIN chapters  c ON c.id = b.chapter_id
    JOIN (
      SELECT c2.novel_id AS nv, b2.device_id AS dev, MAX(b2.updated_at) AS maxu
        FROM bookmarks b2
        JOIN chapters  c2 ON c2.id = b2.chapter_id
       GROUP BY nv, dev
    ) last ON last.nv = c.novel_id AND last.dev = b.device_id AND last.maxu = b.updated_at;
  `,
  // --------------------------- v3 (genres, tags, folders, stats) ---------------------------
  `
  PRAGMA foreign_keys = ON;

  -- 1) Extend novels with release_status (text enum: released | on_voting | draft, etc.)
  ALTER TABLE novels ADD COLUMN release_status TEXT;

  -- 2) Tags (freeform)
  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    slug       TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS novel_tags (
    novel_id   INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
    PRIMARY KEY (novel_id, tag_id)
  );

  -- 3) Genres (curated list)
  CREATE TABLE IF NOT EXISTS genres (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    slug       TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS novel_genres (
    novel_id   INTEGER NOT NULL REFERENCES novels(id)  ON DELETE CASCADE,
    genre_id   INTEGER NOT NULL REFERENCES genres(id)  ON DELETE CASCADE,
    PRIMARY KEY (novel_id, genre_id)
  );

  -- 4) Library folders (user-defined groupings)
  CREATE TABLE IF NOT EXISTS folders (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS novel_folders (
    novel_id   INTEGER NOT NULL REFERENCES novels(id)  ON DELETE CASCADE,
    folder_id  INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    PRIMARY KEY (novel_id, folder_id)
  );

  -- 5) Novel stats (fast min-chapters filter)
  CREATE TABLE IF NOT EXISTS novel_stats (
    novel_id       INTEGER PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
    chapter_count  INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Backfill counts once
  INSERT OR REPLACE INTO novel_stats (novel_id, chapter_count, updated_at)
  SELECT n.id, IFNULL(c.cnt, 0), unixepoch()
  FROM novels n
  LEFT JOIN (SELECT novel_id, COUNT(*) AS cnt FROM chapters GROUP BY novel_id) c
        ON c.novel_id = n.id;

  -- Keep chapter_count in sync
  CREATE TRIGGER IF NOT EXISTS chapters_ai_stats AFTER INSERT ON chapters
  BEGIN
    INSERT INTO novel_stats (novel_id, chapter_count, updated_at)
    VALUES (NEW.novel_id, 1, unixepoch())
    ON CONFLICT(novel_id) DO UPDATE SET
      chapter_count = chapter_count + 1,
      updated_at    = unixepoch();
  END;

  CREATE TRIGGER IF NOT EXISTS chapters_ad_stats AFTER DELETE ON chapters
  BEGIN
    UPDATE novel_stats
      SET chapter_count = MAX(0, chapter_count - 1),
          updated_at    = unixepoch()
    WHERE novel_id = OLD.novel_id;
  END;

  CREATE TRIGGER IF NOT EXISTS chapters_au_stats AFTER UPDATE OF novel_id ON chapters
  BEGIN
    UPDATE novel_stats
      SET chapter_count = MAX(0, chapter_count - 1),
          updated_at    = unixepoch()
    WHERE novel_id = OLD.novel_id;

    INSERT INTO novel_stats (novel_id, chapter_count, updated_at)
    VALUES (NEW.novel_id, 1, unixepoch())
    ON CONFLICT(novel_id) DO UPDATE SET
      chapter_count = chapter_count + 1,
      updated_at    = unixepoch();
  END;

  -- 6) Indexes to make the finder snappy
  CREATE INDEX IF NOT EXISTS idx_novels_title           ON novels(title);
  CREATE INDEX IF NOT EXISTS idx_novels_author          ON novels(author);
  CREATE INDEX IF NOT EXISTS idx_novels_status          ON novels(status);
  CREATE INDEX IF NOT EXISTS idx_novels_release_status  ON novels(release_status);
  CREATE INDEX IF NOT EXISTS idx_novels_created_at      ON novels(created_at);

  CREATE INDEX IF NOT EXISTS idx_tags_name              ON tags(name);
  CREATE INDEX IF NOT EXISTS idx_genres_name            ON genres(name);
  CREATE INDEX IF NOT EXISTS idx_novel_tags_tag         ON novel_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_novel_genres_genre     ON novel_genres(genre_id);
  CREATE INDEX IF NOT EXISTS idx_folders_name           ON folders(name);
  CREATE INDEX IF NOT EXISTS idx_novel_folders_folder   ON novel_folders(folder_id);

  -- 7) Seed common genres (idempotent)
  INSERT OR IGNORE INTO genres (name, slug) VALUES
  ('Action','action'),
  ('Adventure','adventure'),
  ('Drama','drama'),
  ('Erciyuan','erciyuan'),
  ('Fantasy','fantasy'),
  ('Gender-Bender','gender-bender'),
  ('Harem','harem'),
  ('Historical','historical'),
  ('Josei','josei'),
  ('Mature','mature'),
  ('Military','military'),
  ('Psychological','psychological'),
  ('School-Life','school-life'),
  ('Seinen','seinen'),
  ('Shoujo','shoujo'),
  ('Shoujo-Ai','shoujo-ai'),
  ('Shounen','shounen'),
  ('Shounen-Ai','shounen-ai'),
  ('Smut','smut'),
  ('Supernatural','supernatural'),
  ('Urban-Life','urban-life'),
  ('Xianxia','xianxia'),
  ('Yaoi','yaoi'),
  ('Adult','adult'),
  ('Comedy','comedy'),
  ('Ecchi','ecchi'),
  ('Fan-Fiction','fan-fiction'),
  ('Game','game'),
  ('Horror','horror'),
  ('Martial-Arts','martial-arts'),
  ('Mecha','mecha'),
  ('Mystery','mystery'),
  ('Romance','romance'),
  ('Sci-Fi','sci-fi'),
  ('Slice-Of-Life','slice-of-life'),
  ('Sports','sports'),
  ('Tragedy','tragedy'),
  ('Wuxia','wuxia'),
  ('Xuanhuan','xuanhuan'),
  ('Yuri','yuri');
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
      try { await db.execute("ROLLBACK;"); } catch { }
      throw e;
    }
  }
}
