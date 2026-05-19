export type AgentToolName =
  | "get_context"
  | "update_context"
  | "get_schema"
  | "ask_user_question"
  | "write_sql"
  | "run_sql"

export interface ChatSessionMeta {
  id: string
  createdAt: string
  updatedAt: string
  title: string | null
  worksheetSlug: string | null
  connectionId: string | null
  pending: PendingAsk | null
}

export interface PendingAsk {
  toolUseId: string
  question: string
  askedAt: string
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolUseId: string; name: AgentToolName; input: unknown }
  | {
      type: "tool_result"
      toolUseId: string
      name: AgentToolName
      ok: boolean
      summary: string
    }
  | { type: "sql_written"; worksheetSlug: string; sql: string }
  | { type: "ask_user"; toolUseId: string; question: string }
  | { type: "done" }
  | { type: "error"; message: string }
