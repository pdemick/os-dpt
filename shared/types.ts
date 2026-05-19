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
