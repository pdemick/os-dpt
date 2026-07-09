import type { AgentToolName, ChartSpec, ContextUpdateDetail } from "@shared/agent"

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
      /** The tool_use input block. Lets rows expose call details (e.g. run_sql's SQL). */
      input: unknown
      /** Structured tool_result payload (update_context's before/after diff). Live-stream only. */
      detail?: ContextUpdateDetail
    }
  | { id: string; kind: "sql_written"; worksheetSlug: string; length: number }
  | { id: string; kind: "chart"; spec: ChartSpec }
  | { id: string; kind: "ask_user"; toolUseId: string; question: string }
  | { id: string; kind: "error"; message: string }
