import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { openHistoryDb } from "./db.ts"
import { noteRecentWrite } from "./dedup.ts"
import { assertSafeSlug } from "../workspace.ts"
import type { HistorySource } from "@shared/types.ts"

const MERGE_WINDOW_MS = 10_000
const MAX_ENTRIES_PER_WORKSHEET = 50
const MAX_ENTRY_SIZE = 256 * 1024
const PREVIEW_MAX_LEN = 120

// Higher = more important. Used when an incoming entry matches the previous
// entry's sha: if the incoming source outranks the existing one, we re-stamp
// the existing row instead of skipping (so an explicit save isn't swallowed
// by an autosave that happened to write the same content first).
const SOURCE_RANK: Record<HistorySource, number> = {
  autosave: 0,
  external: 1,
  snapshot: 1,
  save: 2,
  revert: 3,
}

export interface RecordOpts {
  worksheet: string
  source: HistorySource
  content: string
  ts?: number
  label?: string | null
  meta?: Record<string, unknown> | null
}

export type RecordSkipReason = "oversize"

export interface RecordResult {
  recorded: boolean
  skipped?: RecordSkipReason
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

function buildPreview(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0) ?? ""
  return line.length > PREVIEW_MAX_LEN ? line.slice(0, PREVIEW_MAX_LEN) + "…" : line
}

export function recordHistory(opts: RecordOpts): RecordResult {
  assertSafeSlug(opts.worksheet)
  const size = Buffer.byteLength(opts.content, "utf8")
  if (size > MAX_ENTRY_SIZE) {
    console.warn(`[history] skipping ${opts.worksheet}: ${size} bytes exceeds cap`)
    return { recorded: false, skipped: "oversize" }
  }

  const db = openHistoryDb()
  const ts = opts.ts ?? Date.now()
  const sha = sha256(opts.content)

  const prev = db
    .prepare(
      `SELECT id, ts, source, blob_sha FROM entries WHERE worksheet = ? ORDER BY ts DESC LIMIT 1`,
    )
    .get(opts.worksheet) as
    | { id: number; ts: number; source: HistorySource; blob_sha: string }
    | undefined

  // sha-match dedup: content unchanged. If the incoming source outranks the
  // existing one (e.g. an explicit save right after an autosave wrote the same
  // bytes), re-stamp the existing row so the timeline reflects the stronger
  // event. Otherwise no-op — also covers the fs.watch echo of our own writes.
  if (prev && prev.blob_sha === sha) {
    if (SOURCE_RANK[opts.source] > SOURCE_RANK[prev.source]) {
      db.prepare(
        `UPDATE entries SET ts = ?, source = ?, label = COALESCE(?, label), meta = COALESCE(?, meta)
           WHERE id = ?`,
      ).run(
        ts,
        opts.source,
        opts.label ?? null,
        opts.meta ? JSON.stringify(opts.meta) : null,
        prev.id,
      )
    }
    return { recorded: true }
  }

  const canCoalesce =
    !!prev &&
    opts.source === "autosave" &&
    prev.source === "autosave" &&
    ts - prev.ts < MERGE_WINDOW_MS

  const compressed = gzipSync(Buffer.from(opts.content, "utf8"))
  const preview = buildPreview(opts.content)

  const insertBlob = db.prepare(
    `INSERT OR IGNORE INTO blobs (sha, bytes, size) VALUES (?, ?, ?)`,
  )
  const insertEntry = db.prepare(
    `INSERT INTO entries (worksheet, ts, source, blob_sha, size, label, meta, preview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const deleteById = db.prepare(`DELETE FROM entries WHERE id = ?`)

  const tx = db.transaction(() => {
    insertBlob.run(sha, compressed, size)
    const coalesced = !!(canCoalesce && prev) && deleteById.run(prev!.id).changes > 0
    insertEntry.run(
      opts.worksheet,
      ts,
      opts.source,
      sha,
      size,
      opts.label ?? null,
      opts.meta ? JSON.stringify(opts.meta) : null,
      preview,
    )
    const evicted = enforcePerWorksheetCap(opts.worksheet)
    // Orphans can only appear when entries are deleted. The O(n) scan is too
    // expensive to run on every autosave, so gate it on actual entry removal.
    if (coalesced || evicted) gcOrphanBlobs()
  })
  tx()
  noteRecentWrite(opts.worksheet, sha)
  return { recorded: true }
}

function enforcePerWorksheetCap(worksheet: string): boolean {
  const db = openHistoryDb()
  const { n } = db
    .prepare(`SELECT COUNT(*) as n FROM entries WHERE worksheet = ?`)
    .get(worksheet) as { n: number }
  if (n <= MAX_ENTRIES_PER_WORKSHEET) return false
  const result = db
    .prepare(
      `DELETE FROM entries WHERE id IN (
         SELECT id FROM entries WHERE worksheet = ? ORDER BY ts ASC LIMIT ?
       )`,
    )
    .run(worksheet, n - MAX_ENTRIES_PER_WORKSHEET)
  return result.changes > 0
}

function gcOrphanBlobs(): void {
  const db = openHistoryDb()
  db.prepare(
    `DELETE FROM blobs WHERE sha NOT IN (SELECT DISTINCT blob_sha FROM entries)`,
  ).run()
}
