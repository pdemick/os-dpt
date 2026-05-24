// Canonical definitions for the agent's context documents — the markdown files
// in the workspace's context/ directory. Shared by the server (storage + agent
// tools) and the client (Documentation view) so the set stays in one place.

export interface ContextDocDef {
  name: string
  title: string
  description: string
}

export const CONTEXT_DOCS = [
  {
    name: "schemas",
    title: "Schemas",
    description: "Table and column facts the agent has learned about the data source.",
  },
  {
    name: "conventions",
    title: "Conventions",
    description: "How the team writes SQL and what business terms mean.",
  },
  {
    name: "feedback",
    title: "Feedback",
    description: "Corrections and lessons learned from running queries.",
  },
] as const satisfies readonly ContextDocDef[]

export type ContextDocName = (typeof CONTEXT_DOCS)[number]["name"]

export const CONTEXT_DOC_NAMES = CONTEXT_DOCS.map((d) => d.name) as ContextDocName[]

export interface ContextDocMeta extends ContextDocDef {
  name: ContextDocName
  /** ISO mtime, or null when the file hasn't been written yet. */
  updatedAt: string | null
  /** Byte size on disk; 0 when the file doesn't exist. */
  size: number
}

export interface ContextDocPayload {
  meta: ContextDocMeta
  content: string
}
