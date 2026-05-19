import { createContext } from "react"
import type {
  CursorPos,
  HistorySkipReason,
  QueryResponse,
  Session,
  SQLNamespace,
  WorksheetMeta,
} from "@shared/types"

export interface FileState {
  meta: WorksheetMeta
  content: string
  buffer: string
  draftOnDisk: string | null
  lastSavedAt: number
  /** Set when the most recent save/autosave was not recorded to history (e.g. oversize). */
  historyWarning: HistorySkipReason | null
}

export interface TabRuntime {
  running: boolean
  lastResult: QueryResponse | null
}

export interface WorksheetsContextValue {
  files: Record<string, FileState>
  list: WorksheetMeta[]
  session: Session
  /** Schema fed to CodeMirror for the active tab — per-connection if bound, else the static workspace schema. */
  schema: SQLNamespace
  runtimes: Record<string, TabRuntime>
  loading: boolean

  openTab: (slug: string) => Promise<void>
  closeTab: (slug: string) => void
  setActive: (slug: string | null) => void
  /** explicit=false marks the change as automatic (e.g. sole-connection auto-bind), so it
   *  does not "lock in" the tab against future auto-binds. Defaults to true. */
  setTabConnection: (
    slug: string,
    connectionId: string | null,
    opts?: { explicit?: boolean },
  ) => void
  updateBuffer: (slug: string, content: string) => void
  updateCursor: (slug: string, cursor: CursorPos, scrollTop: number) => void
  save: (slug: string) => Promise<void>
  createWorksheet: (name?: string) => Promise<string>
  deleteWorksheet: (slug: string) => Promise<void>
  renameWorksheet: (slug: string, name: string) => Promise<void>
  refreshList: () => Promise<void>
  /** Refresh schema for the active tab's connection (or fall back to the static file). */
  refreshSchema: () => Promise<void>
  /** Apply server-side revert: replace buffer + saved content with the restored version. */
  applyReverted: (slug: string, content: string) => void
  /** Clear the per-slug history warning (e.g. after the user dismisses the banner). */
  clearHistoryWarning: (slug: string) => void
  executeActive: (sql: string) => Promise<void>
  clearResult: (slug: string) => void
  setResultsPaneSize: (size: number | null) => void

  dirty: (slug: string) => boolean
}

export const WorksheetsContext = createContext<WorksheetsContextValue | null>(null)
