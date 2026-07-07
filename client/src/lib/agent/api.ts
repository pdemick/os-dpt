import type {
  AgentEvent,
  ChatMode,
  ChatSessionMeta,
  UsageEntry,
  UsageTotals,
} from "@shared/agent"

export interface CreateSessionInput {
  worksheetSlug?: string | null
  connectionId?: string | null
  title?: string | null
  /** Marks a Chat-page session; see ChatSessionMeta.standalone. */
  standalone?: boolean
  /** Agent surface; see ChatSessionMeta.mode. Defaults to "chat". */
  mode?: ChatMode
}

export interface WorksheetUsageSession {
  id: string
  title: string | null
  worksheetSlug: string | null
  updatedAt: string
  totals: UsageTotals
}

export interface ChatSessionResponse {
  meta: ChatSessionMeta
  // messages are sent in Anthropic's content-block shape; the UI doesn't
  // rely on full hydration of past transcripts in this first cut.
  messages: unknown[]
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export const agentApi = {
  createSession: async (input: CreateSessionInput): Promise<ChatSessionResponse> =>
    jsonOrThrow(
      await fetch("/api/agent/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    ),

  listSessions: async (): Promise<ChatSessionMeta[]> => {
    const data = await jsonOrThrow<{ sessions: ChatSessionMeta[] }>(
      await fetch("/api/agent/sessions"),
    )
    return data.sessions
  },

  getSession: async (id: string): Promise<ChatSessionResponse> =>
    jsonOrThrow(await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`)),

  updateSession: async (
    id: string,
    patch: { connectionId?: string | null },
  ): Promise<ChatSessionMeta> =>
    jsonOrThrow(
      await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    ),

  deleteSession: async (id: string): Promise<void> => {
    await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  },

  // Best-effort LLM titling from the first user message. Returns skipped:true
  // (with a reason, and an error string for model failures) when no title was
  // generated; the caller keeps the truncated fallback in that case.
  autoNameSession: async (
    id: string,
  ): Promise<{
    title: string | null
    skipped: boolean
    reason?: "already-named" | "empty" | "model-error"
    error?: string
  }> =>
    jsonOrThrow(
      await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/auto-name`, {
        method: "POST",
      }),
    ),

  getWorksheetUsage: async (
    slug: string,
  ): Promise<{ totals: UsageTotals; bySession: WorksheetUsageSession[] }> =>
    jsonOrThrow(
      await fetch(
        `/api/agent/usage?worksheetSlug=${encodeURIComponent(slug)}`,
      ),
    ),

  getSessionUsage: async (
    id: string,
  ): Promise<{ totals: UsageTotals; entries: UsageEntry[] }> =>
    jsonOrThrow(
      await fetch(
        `/api/agent/sessions/${encodeURIComponent(id)}/usage`,
      ),
    ),

  sendMessage: (id: string, message: string, signal?: AbortSignal) =>
    streamPost(`/api/agent/sessions/${encodeURIComponent(id)}/messages`, { message }, signal),

  respond: (id: string, answer: string, signal?: AbortSignal) =>
    streamPost(`/api/agent/sessions/${encodeURIComponent(id)}/respond`, { answer }, signal),
}

async function streamPost(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<AsyncGenerator<AgentEvent>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const errBody = (await res.json().catch(() => null)) as
      | { error?: string }
      | null
    throw new Error(errBody?.error ?? `${res.status} ${res.statusText}`)
  }
  return parseSSE(res.body)
}

async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const data = chunk
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n")
        if (!data) continue
        try {
          yield JSON.parse(data) as AgentEvent
        } catch {
          // ignore malformed frame
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
