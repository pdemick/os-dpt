import Database from "better-sqlite3"
import type { Database as DB } from "better-sqlite3"
import { paths } from "../workspace.ts"

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS blobs (
  sha       TEXT PRIMARY KEY,
  bytes     BLOB NOT NULL,
  size      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  worksheet TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  source    TEXT NOT NULL,
  blob_sha  TEXT NOT NULL REFERENCES blobs(sha),
  size      INTEGER NOT NULL,
  label     TEXT,
  meta      TEXT,
  preview   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_entries_worksheet_ts ON entries(worksheet, ts DESC);
`

let db: DB | null = null

export function openHistoryDb(): DB {
  if (db) return db
  db = new Database(paths.history())
  db.exec(SCHEMA)
  return db
}

export function closeHistoryDb(): void {
  if (!db) return
  db.close()
  db = null
}
