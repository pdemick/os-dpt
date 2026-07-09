export type AgentToolName =
  | "get_context"
  | "update_context"
  | "get_schema"
  | "ask_user_question"
  | "write_sql"
  | "run_sql"
  | "render_chart"

/** Chart kinds the agent can render into the chat. */
export type ChartType = "bar" | "line" | "area" | "pie"

/** One numeric series plotted from a column of the supplied data. */
export interface ChartSeries {
  /** Key into each data row holding this series' numeric value. */
  key: string
  /** Human-readable label for the legend/tooltip. Defaults to `key`. */
  label?: string
}

/**
 * A self-contained chart the agent renders inline in the chat. The agent
 * supplies the data rows directly (shaped from its run_sql results), so the
 * spec carries everything the client needs to draw it.
 */
export interface ChartSpec {
  type: ChartType
  /** Optional title shown above the chart. */
  title?: string
  /** Row key for the category axis (x-axis for bar/line/area; slice label for pie). */
  x: string
  /** Series to plot. For pie, only the first series is used (slice value). */
  series: ChartSeries[]
  /** Row objects to chart, e.g. `[{ month: "Jan", revenue: 120 }, …]`. */
  data: Record<string, unknown>[]
}

/**
 * How a session drives the agent. "chat" is the conversational surface
 * (side panel / Chat page). "quick-edit" is the editor's floating prompt box:
 * same agent loop, but the prompt demands SQL-only output via write_sql (no
 * prose) and the chart/ask-user tools are withheld.
 */
export type ChatMode = "chat" | "quick-edit"

export interface ChatSessionMeta {
  id: string
  mode: ChatMode
  createdAt: string
  updatedAt: string
  title: string | null
  /**
   * True once `title` was set by the LLM auto-namer (vs. the immediate
   * truncation fallback). Gates re-naming so the auto-name endpoint runs at
   * most once per session.
   */
  titleGenerated: boolean
  worksheetSlug: string | null
  /**
   * True only for sessions created from the standalone Chat page. Used to
   * categorize history: the Chat page lists its own (`standalone`) sessions,
   * the worksheet panel lists sessions bound to the active worksheet. A panel
   * chat started with no active worksheet is `standalone: false` with a null
   * `worksheetSlug` — explore-only (no write_sql) but kept out of the Chat
   * page's history. Tool/prompt behavior keys on `worksheetSlug`, not this.
   */
  standalone: boolean
  connectionId: string | null
  pending: PendingAsk | null
  usage: UsageEntry[]
  totals: UsageTotals
  /**
   * Braintrust exported parent-span handle for this chat's trace. Set on the
   * first traced turn; later turns resume under it so the whole conversation
   * is one trace instead of one-per-message. Only present when tracing is on.
   */
  traceParent?: string | null
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

/**
 * Before/after snapshot of a context file changed by update_context,
 * surfaced on its tool_result event so the transcript can render the
 * change as a diff. Live-stream only — like tool summaries, it isn't
 * persisted with the session messages.
 */
export interface ContextUpdateDetail {
  file: string
  mode: "append" | "replace"
  /** Full file content before the write ("" when the file didn't exist). */
  before: string
  /** Full file content after the write. */
  after: string
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
      /** Structured payload for rows that show more than a summary (update_context's diff). */
      detail?: ContextUpdateDetail
    }
  | { type: "sql_written"; worksheetSlug: string; sql: string }
  | { type: "chart_rendered"; spec: ChartSpec }
  | { type: "ask_user"; toolUseId: string; question: string }
  | { type: "usage"; entry: UsageEntry; totals: UsageTotals }
  | { type: "done" }
  | { type: "error"; message: string }
