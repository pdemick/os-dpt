import type { AgentToolName } from "@shared/agent"

export type TranscriptItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant_text"; text: string }
  | {
      id: string
      kind: "tool"
      toolUseId: string
      name: AgentToolName
      status: "running" | "ok" | "error"
      summary: string
    }
  | { id: string; kind: "sql_written"; worksheetSlug: string; length: number }
  | { id: string; kind: "ask_user"; toolUseId: string; question: string }
  | { id: string; kind: "error"; message: string }
