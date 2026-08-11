import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3, { type Database } from "better-sqlite3";
import { migrate } from "./migrations.js";

export const openDatabase = ({ dbPath }: { dbPath: string }): Database => {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

  const db = new BetterSqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate({ db });
  return db;
};
