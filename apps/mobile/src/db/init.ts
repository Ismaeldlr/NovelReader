import { open } from "react-native-quick-sqlite";
import { applyMigrations } from "@novel/core";

export async function initDb() {
  const db = open({ name: "novels.db" }); // lives in app’s files dir
  // quick-sqlite doesn’t have .select; shim it:
  const exec = (sql: string) => db.executeAsync(sql);
  const select = async (sql: string) => {
    const r = await db.executeAsync(sql);
    // quick-sqlite returns { rows: any[] } (depending on version)
    // normalize to array of objects:
    return r?.rows?._array ?? [];
  };
  await exec("PRAGMA foreign_keys=ON;");
  await exec("PRAGMA journal_mode=WAL;");
  await applyMigrations({ execute: exec, select });
  return db;
}
