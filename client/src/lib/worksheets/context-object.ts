import { createContext } from "react"
import type {
  CursorPos,
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
}

export interface WorksheetsContextValue {
  files: Record<string, FileState>
  list: WorksheetMeta[]
  session: Session
  schema: SQLNamespace
  loading: boolean

  openTab: (slug: string) => Promise<void>
  closeTab: (slug: string) => void
  setActive: (slug: string | null) => void
  updateBuffer: (slug: string, content: string) => void
  updateCursor: (slug: string, cursor: CursorPos, scrollTop: number) => void
  save: (slug: string) => Promise<void>
  restoreDraft: (slug: string) => void
  discardDraft: (slug: string) => Promise<void>
  createWorksheet: (name: string) => Promise<string>
  deleteWorksheet: (slug: string) => Promise<void>
  refreshList: () => Promise<void>
  refreshSchema: () => Promise<void>

  dirty: (slug: string) => boolean
}

export const WorksheetsContext = createContext<WorksheetsContextValue | null>(null)
