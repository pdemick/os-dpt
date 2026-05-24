import type { AgentToolName, ChartSpec } from "@shared/agent"

import type { TranscriptItem } from "./context-types"

// Minimal shape we read out of stored Anthropic.MessageParam values.
// Avoids adding @anthropic-ai/sdk as a client dep just for types.
type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown }

type Msg = {
  role: "user" | "assistant"
  content: string | Block[]
}

function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Replay a stored chat's messages into the same TranscriptItem shape the
// live SSE stream produces. Tool result blocks (the user-role payload the
// loop sends back to Claude) are skipped — they're internal plumbing, not
// something to show in the transcript. Tool-call summaries aren't stored,
// so replayed tool rows render with an empty summary.
export function hydrateMessages(messages: unknown): TranscriptItem[] {
  if (!Array.isArray(messages)) return []
  const out: TranscriptItem[] = []
  for (const raw of messages as Msg[]) {
    if (!raw || typeof raw !== "object") continue
    const { role, content } = raw
    if (role === "user") {
      if (typeof content === "string") {
        out.push({ id: rid(), kind: "user", text: content })
      }
      // Array content on a user message is tool_result blocks — skip.
      continue
    }
    if (role === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue
        if (block.type === "text" && typeof block.text === "string") {
          out.push({ id: rid(), kind: "assistant_text", text: block.text })
        } else if (block.type === "tool_use") {
          // Replay charts from the stored tool input so reloaded chats keep
          // their visualizations instead of a bare "render_chart" tool row.
          // A malformed spec falls through to the generic tool row below so
          // the call is still visible rather than silently dropped.
          const spec =
            block.name === "render_chart" ? (block.input as ChartSpec | undefined) : undefined
          if (spec && Array.isArray(spec.data) && Array.isArray(spec.series)) {
            out.push({ id: rid(), kind: "chart", spec })
          } else {
            out.push({
              id: rid(),
              kind: "tool",
              toolUseId: block.id,
              name: block.name as AgentToolName,
              status: "ok",
              summary: "",
            })
          }
        }
      }
    }
  }
  return out
}
