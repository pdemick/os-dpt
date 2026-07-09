import type Anthropic from "@anthropic-ai/sdk"

import type { AgentEvent, AgentToolName, ContextUpdateDetail } from "@shared/agent.ts"

import type { ChatSession } from "../session.ts"

export interface ToolContext {
  session: ChatSession
}

export interface ToolExecution {
  /** Stringified result the LLM sees as the tool_result content. */
  toolResult: string
  /** True if Anthropic should be told this was an error (tells the model to recover). */
  isError: boolean
  /** Short human-readable summary surfaced to the UI in the tool_result SSE event. */
  uiSummary: string
  /** Structured payload carried on the tool_result SSE event (update_context's before/after diff). */
  detail?: ContextUpdateDetail
  /** Additional SSE events the loop should emit (e.g. sql_written). */
  events?: AgentEvent[]
  /** If set, the loop pauses, persists `pending`, and closes the SSE stream. */
  pause?: { question: string }
}

export interface AgentTool {
  name: AgentToolName
  description: string
  input_schema: Anthropic.Tool["input_schema"]
  execute(input: unknown, ctx: ToolContext): Promise<ToolExecution>
}

import { getContextTool } from "./get_context.ts"
import { updateContextTool } from "./update_context.ts"
import { getSchemaTool } from "./get_schema.ts"
import { askUserQuestionTool } from "./ask_user_question.ts"
import { writeSqlTool } from "./write_sql.ts"
import { runSqlTool } from "./run_sql.ts"
import { renderChartTool } from "./render_chart.ts"

export const TOOLS: AgentTool[] = [
  getContextTool,
  updateContextTool,
  getSchemaTool,
  askUserQuestionTool,
  writeSqlTool,
  runSqlTool,
  renderChartTool,
]

const TOOL_BY_NAME: Record<string, AgentTool> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
)

export function findTool(name: string): AgentTool | undefined {
  return TOOL_BY_NAME[name]
}

export interface ToolDefOptions {
  /**
   * When false, worksheet-targeting tools (write_sql) are withheld — used by
   * standalone chat sessions that have no worksheet to stage SQL into.
   * Defaults to true.
   */
  worksheetBound?: boolean
  /**
   * Agent surface. "quick-edit" (the editor's floating prompt box) withholds
   * render_chart (no chat surface to draw into) and ask_user_question (the box
   * has no answer UI; the prompt tells the model to assume and note it in a
   * SQL comment instead). Defaults to "chat".
   */
  mode?: "chat" | "quick-edit"
}

export function anthropicToolDefs(opts: ToolDefOptions = {}): Anthropic.Tool[] {
  const { worksheetBound = true, mode = "chat" } = opts
  const withheld = new Set<AgentToolName>()
  if (!worksheetBound) withheld.add("write_sql")
  if (mode === "quick-edit") {
    withheld.add("render_chart")
    withheld.add("ask_user_question")
  }
  return TOOLS.filter((t) => !withheld.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))
}
