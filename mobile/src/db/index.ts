import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './migrations';
import { applyMigrations } from './migrations';

export type DB = {
  execute: (sql: string, params?: any[]) => Promise<void>;
  select:  <T=any>(sql: string, params?: any[]) => Promise<T[]>;
  withTransaction?: <T>(fn: () => Promise<T>) => Promise<T>;
};

let once: Promise<DB> | null = null;
export function initDb() {
  if (!once) once = actuallyInit();
  return once;
}

async function actuallyInit(): Promise<DB> {
  const db = await SQLite.openDatabaseAsync('novels.db');

  // best-effort pragmas
  try { await db.execAsync('PRAGMA foreign_keys=ON'); } catch {}

  const adapter: DB = {
    execute: async (sql, params) => { await db.runAsync(sql, ...(params ?? [])); },
    select : (sql, params) => db.getAllAsync(sql, ...(params ?? [])),
    withTransaction: async (fn) => {
      let result: any;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result;
    },
  };

  await applyMigrations(adapter, MIGRATIONS);
  return adapter;
}