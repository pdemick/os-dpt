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
}

export interface Session {
  openTabs: TabState[]
  activeSlug: string | null
}

export type SQLNamespace =
  | { [name: string]: SQLNamespace }
  | string[]
  | { self: { label: string }; children: SQLNamespace }

export interface WorksheetPayload {
  meta: WorksheetMeta
  content: string
  draftContent: string | null
}
