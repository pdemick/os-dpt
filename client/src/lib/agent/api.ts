import type { AgentEvent, ChatSessionMeta } from "@shared/agent"

export interface CreateSessionInput {
  worksheetSlug?: string | null
  connectionId?: string | null
  title?: string | null
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

  deleteSession: async (id: string): Promise<void> => {
    await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  },

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
