import type Anthropic from "@anthropic-ai/sdk"

import type { AgentEvent, AgentToolName } from "@shared/agent.ts"

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
}

export function anthropicToolDefs(opts: ToolDefOptions = {}): Anthropic.Tool[] {
  const { worksheetBound = true } = opts
  return TOOLS.filter((t) => worksheetBound || t.name !== "write_sql").map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))
}
