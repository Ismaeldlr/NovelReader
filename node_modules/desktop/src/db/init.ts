import Database from "@tauri-apps/plugin-sql";
import { applyMigrations } from "@novel/core";

let initOnce: Promise<{ execute:(s:string,p?:any[])=>Promise<any>; select:(s:string,p?:any[])=>Promise<any[]>; }> | null = null;

export function initDb() {
  if (!initOnce) initOnce = actuallyInit();
  return initOnce;
}

async function actuallyInit() {
  const db = await Database.load("sqlite:novels.db");

  const exec   = (sql: string, params?: any[]) => db.execute(sql, params) as Promise<any>;
  const select = (sql: string, params?: any[]) => db.select(sql, params)   as Promise<any[]>;

  await exec("PRAGMA journal_mode=WAL;");
  await exec("PRAGMA synchronous=NORMAL;");
  await exec("PRAGMA foreign_keys=ON;");
  await exec("PRAGMA busy_timeout=5000;");

  await applyMigrations({ execute: exec, select });
  return { execute: exec, select };
}
