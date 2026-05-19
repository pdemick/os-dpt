export interface WorksheetMeta {
  slug: string
  name: string
  updatedAt: string
}

export interface CursorPos {
  line: number
  ch: number
}

export interface TabState {
  slug: string
  cursor: CursorPos
  scrollTop: number
  connectionId: string | null
  /** True once the user has explicitly picked or cleared this tab's connection.
   *  Suppresses the "auto-bind sole active connection" behavior on later loads. */
  connectionExplicit?: boolean
}

export interface Session {
  openTabs: TabState[]
  activeSlug: string | null
  resultsPaneSize: number | null
}

export interface QueryColumn {
  name: string
  dataTypeID: number
}

export interface QueryOk {
  ok: true
  columns: QueryColumn[]
  rows: unknown[][]
  rowCount: number
  durationMs: number
  truncated: boolean
}

export interface QueryErr {
  ok: false
  error: string
  code?: string
}

export type QueryResponse = QueryOk | QueryErr

export type SQLNamespace =
  | { [name: string]: SQLNamespace }
  | string[]
  | { self: { label: string }; children: SQLNamespace }

export interface WorksheetPayload {
  meta: WorksheetMeta
  content: string
  draftContent: string | null
}

export interface WorksheetSearchHit {
  slug: string
  name: string
  /** One-line excerpt around the first content match; empty if only the slug matched. */
  snippet: string
  /** 1-based line number of the snippet, when there's a content hit. */
  lineNumber?: number
}

export type HistorySource =
  | "autosave"
  | "save"
  | "revert"
  | "external"
  | "snapshot"

export interface HistoryEntry {
  id: number
  worksheet: string
  ts: number
  source: HistorySource
  size: number
  label: string | null
  meta: Record<string, unknown> | null
  preview: string
  /** SHA-256 hex of the entry's content. Used to skip rows identical to the current buffer. */
  contentSha: string
}

export interface HistoryEntryDetail extends HistoryEntry {
  content: string
}

export type HistorySkipReason = "oversize"

export interface SaveWorksheetResponse extends WorksheetMeta {
  historySkipped: HistorySkipReason | null
}

export interface GitCommitItem {
  kind: "git"
  sha: string
  ts: number
  subject: string
  author: string | null
  /** Git blob SHA-1 of the worksheet file at this commit; null when unknown. */
  contentSha: string | null
}

export interface HistoryTimelineItem {
  kind: "history"
  entry: HistoryEntry
}

export type TimelineItem = HistoryTimelineItem | GitCommitItem
