import { gunzipSync } from "node:zlib"
import { openHistoryDb } from "./db.ts"
import { recordHistory } from "./record.ts"
import { assertSafeSlug, paths } from "../workspace.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import type { HistoryEntry, HistoryEntryDetail, HistorySource } from "@shared/types.ts"

interface EntryRow {
  id: number
  worksheet: string
  ts: number
  source: HistorySource
  blob_sha: string
  size: number
  label: string | null
  meta: string | null
  preview: string
}

function rowToEntry(row: EntryRow): HistoryEntry {
  return {
    id: row.id,
    worksheet: row.worksheet,
    ts: row.ts,
    source: row.source,
    size: row.size,
    label: row.label,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
    preview: row.preview,
    contentSha: row.blob_sha,
  }
}

export function listEntries(worksheet: string): HistoryEntry[] {
  assertSafeSlug(worksheet)
  const db = openHistoryDb()
  const rows = db
    .prepare(
      `SELECT id, worksheet, ts, source, blob_sha, size, label, meta, preview
         FROM entries WHERE worksheet = ? ORDER BY ts DESC`,
    )
    .all(worksheet) as EntryRow[]
  return rows.map(rowToEntry)
}

export function hasEntries(worksheet: string): boolean {
  assertSafeSlug(worksheet)
  const db = openHistoryDb()
  const row = db
    .prepare(`SELECT 1 as one FROM entries WHERE worksheet = ? LIMIT 1`)
    .get(worksheet) as { one: number } | undefined
  return !!row
}

export function getEntry(worksheet: string, id: number): HistoryEntryDetail | null {
  assertSafeSlug(worksheet)
  const db = openHistoryDb()
  const row = db
    .prepare(
      `SELECT e.id, e.worksheet, e.ts, e.source, e.blob_sha, e.size, e.label, e.meta, e.preview, b.bytes
         FROM entries e JOIN blobs b ON b.sha = e.blob_sha
         WHERE e.worksheet = ? AND e.id = ?`,
    )
    .get(worksheet, id) as (EntryRow & { bytes: Buffer }) | undefined
  if (!row) return null
  const content = gunzipSync(row.bytes).toString("utf8")
  return { ...rowToEntry(row), content }
}

export async function revertToEntry(
  worksheet: string,
  id: number,
): Promise<HistoryEntryDetail | null> {
  const entry = getEntry(worksheet, id)
  if (!entry) return null
  recordHistory({
    worksheet,
    source: "revert",
    content: entry.content,
    meta: { revertedFromEntryId: id },
  })
  await writeAtomic(paths.worksheet(worksheet), entry.content)
  return entry
}

export function deleteWorksheetHistory(worksheet: string): void {
  assertSafeSlug(worksheet)
  const db = openHistoryDb()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM entries WHERE worksheet = ?`).run(worksheet)
    db.prepare(
      `DELETE FROM blobs WHERE sha NOT IN (SELECT DISTINCT blob_sha FROM entries)`,
    ).run()
  })
  tx()
}
