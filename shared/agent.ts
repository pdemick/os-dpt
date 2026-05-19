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
  usage: UsageEntry[]
  totals: UsageTotals
}

/** One Anthropic API call's usage, attributed to a chat session. */
export interface UsageEntry {
  at: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  /** Number of API calls (i.e. usage entries) folded into this rollup. */
  calls: number
}

export function emptyTotals(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    calls: 0,
  }
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
  | { type: "usage"; entry: UsageEntry; totals: UsageTotals }
  | { type: "done" }
  | { type: "error"; message: string }
