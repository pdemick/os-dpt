import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

import {
  emptyTotals,
  type AgentEvent,
  type ChatSessionMeta,
  type UsageTotals,
} from "@shared/agent.ts"

import { activeIds } from "../db/registry.ts"
import { resumeWithAnswer, runAgentTurn } from "../agent/loop.ts"
import { generateChatTitle } from "../agent/naming.ts"
import {
  appendMessage,
  createChat,
  deleteChat,
  getChat,
  listChats,
  setConnection,
  setTitle,
} from "../agent/session.ts"

const app = new Hono()

// Serialize work against the same session so two concurrent requests
// (e.g. a fast double-submit, or /messages racing /respond) don't load
// divergent in-memory copies and clobber each other on writeAtomic.
// Local single-user, so contention is near-zero — this is cheap insurance.
const sessionLocks = new Map<string, Promise<unknown>>()

async function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(id) ?? Promise.resolve()
  // .catch(() => {}) so a previous chain's rejection doesn't poison ours.
  const ours = prev.catch(() => {}).then(fn)
  sessionLocks.set(id, ours)
  try {
    return await ours
  } finally {
    // Best-effort GC: only delete if no newer caller has chained on us.
    if (sessionLocks.get(id) === ours) sessionLocks.delete(id)
  }
}

app.get("/sessions", async (c) => {
  const sessions = await listChats()
  return c.json({ sessions })
})

function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    costUsd: a.costUsd + b.costUsd,
    calls: a.calls + b.calls,
  }
}

/**
 * Aggregate token usage across sessions. Filter by ?worksheetSlug=... to
 * scope to a single worksheet; omit the param for workspace-wide totals.
 * Returns both the rollup and a per-session breakdown so the UI can show
 * "this worksheet cost $X across N chats."
 */
app.get("/usage", async (c) => {
  const slug = c.req.query("worksheetSlug")
  const all = await listChats()
  const sessions = slug
    ? all.filter((s) => s.worksheetSlug === slug)
    : all
  const totals = sessions.reduce<UsageTotals>(
    (acc, s) => addTotals(acc, s.totals),
    emptyTotals(),
  )
  const bySession = sessions.map((s: ChatSessionMeta) => ({
    id: s.id,
    title: s.title,
    worksheetSlug: s.worksheetSlug,
    updatedAt: s.updatedAt,
    totals: s.totals,
  }))
  return c.json({ totals, bySession })
})

app.get("/sessions/:id/usage", async (c) => {
  const session = await getChat(c.req.param("id"))
  if (!session) return c.json({ error: "not_found" }, 404)
  return c.json({
    totals: session.meta.totals,
    entries: session.meta.usage,
  })
})

app.post("/sessions", async (c) => {
  const body = await c.req
    .json<{
      worksheetSlug?: string
      connectionId?: string
      title?: string
      standalone?: boolean
      mode?: string
    }>()
    .catch(() => ({}) as Record<string, never>)
  const session = await createChat({
    worksheetSlug: body.worksheetSlug ?? null,
    connectionId: body.connectionId ?? null,
    title: body.title ?? null,
    standalone: body.standalone ?? false,
    mode: body.mode === "quick-edit" ? "quick-edit" : "chat",
  })
  return c.json(session, 201)
})

app.get("/sessions/:id", async (c) => {
  const session = await getChat(c.req.param("id"))
  if (!session) return c.json({ error: "not_found" }, 404)
  return c.json(session)
})

// Update mutable session bindings (currently just the connection run_sql
// targets). Returns the updated meta so the client can refresh its badge.
app.patch("/sessions/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req
    .json<{ connectionId?: string | null }>()
    .catch(() => ({}) as { connectionId?: string | null })
  return withSessionLock(id, async () => {
    const session = await getChat(id)
    if (!session) return c.json({ error: "not_found" }, 404)
    if ("connectionId" in body) {
      const cid = body.connectionId
      if (cid !== null && typeof cid !== "string") {
        return c.json({ error: "connectionId must be a string or null" }, 400)
      }
      // run_sql needs a live pool, so only an active connection can be bound.
      // The picker only offers active ones; reject anything else defensively.
      if (cid !== null && !activeIds().has(cid)) {
        return c.json({ error: "connection is not active" }, 400)
      }
      await setConnection(session, cid)
    }
    return c.json(session.meta)
  })
})

app.delete("/sessions/:id", async (c) => {
  await deleteChat(c.req.param("id"))
  return c.json({ ok: true })
})

/** Pull the text of the first user turn for titling. Content may be a plain
 *  string (how we persist live messages) or Anthropic content blocks. */
function firstUserText(messages: { role: string; content: unknown }[]): string {
  const first = messages.find((m) => m.role === "user")
  if (!first) return ""
  const { content } = first
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        b && typeof b === "object" && "type" in b && b.type === "text" && "text" in b
          ? String((b as { text: unknown }).text)
          : "",
      )
      .join("")
      .trim()
  }
  return ""
}

// Best-effort LLM titling of a chat from its first user message. The truncated
// fallback title is already set when the message lands (see /messages), so on
// any failure the client keeps that and we report the reason. Runs at most once
// per session via the titleGenerated flag.
app.post("/sessions/:id/auto-name", async (c) => {
  const id = c.req.param("id")
  return withSessionLock(id, async () => {
    const session = await getChat(id)
    if (!session) return c.json({ error: "not_found" }, 404)
    if (session.meta.titleGenerated) {
      return c.json({
        title: session.meta.title,
        skipped: true,
        reason: "already-named" as const,
      })
    }
    const prompt = firstUserText(session.messages)
    if (!prompt) {
      return c.json({ title: session.meta.title, skipped: true, reason: "empty" as const })
    }
    try {
      const title = await generateChatTitle(prompt)
      await setTitle(session, title, true)
      return c.json({ title, skipped: false })
    } catch (err) {
      const message = (err as Error).message
      console.warn(`auto-name chat ${id} failed:`, message)
      return c.json({
        title: session.meta.title,
        skipped: true,
        reason: "model-error" as const,
        error: message,
      })
    }
  })
})

app.post("/sessions/:id/messages", async (c) => {
  const id = c.req.param("id")
  const body = await c.req
    .json<{ message?: string }>()
    .catch(() => ({}) as { message?: string })
  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (message === "") {
    return c.json({ error: "Missing required field: message" }, 400)
  }
  // Pre-check outside the lock so we can return proper 404/409 JSON
  // before opening the SSE stream. We re-check under the lock too,
  // because a concurrent request may have advanced state by then.
  const initial = await getChat(id)
  if (!initial) return c.json({ error: "not_found" }, 404)
  if (initial.meta.pending) {
    return c.json(
      {
        error:
          "Session is waiting on a pending question. POST /respond to answer it first.",
      },
      409,
    )
  }

  return streamSSE(c, async (stream) => {
    // Aborts when the client disconnects (quick-edit cancel, closed tab).
    // The loop stops at its next safe point instead of running the turn to
    // completion, and emits to the dead stream become no-ops.
    const signal = c.req.raw.signal
    const emit = async (event: AgentEvent) => {
      if (signal.aborted) return
      await stream.writeSSE({ data: JSON.stringify(event) })
    }
    try {
      await withSessionLock(id, async () => {
        // Re-fetch under the lock so we observe writes from any sibling
        // request that completed while we were queued.
        const session = await getChat(id)
        if (!session) {
          await emit({ type: "error", message: "Session no longer exists." })
          return
        }
        if (session.meta.pending) {
          await emit({
            type: "error",
            message:
              "Session is waiting on a pending question — answer via /respond first.",
          })
          return
        }
        // The user message + auto-title are persisted BEFORE the loop
        // runs. If runAgentTurn throws mid-stream the message is on
        // disk but the client saw no reply — do NOT add a client-side
        // retry without checking whether the last persisted user
        // message matches, or you'll double-append on retry.
        await appendMessage(session, { role: "user", content: message })
        if (!session.meta.title) {
          await setTitle(session, message.slice(0, 60))
        }
        await runAgentTurn({ session, emit, signal })
      })
    } catch (err) {
      await emit({ type: "error", message: (err as Error).message })
    }
  })
})

app.post("/sessions/:id/respond", async (c) => {
  const id = c.req.param("id")
  const body = await c.req
    .json<{ answer?: string }>()
    .catch(() => ({}) as { answer?: string })
  const answer = typeof body.answer === "string" ? body.answer.trim() : ""
  if (answer === "") {
    return c.json({ error: "Missing required field: answer" }, 400)
  }
  const initial = await getChat(id)
  if (!initial) return c.json({ error: "not_found" }, 404)
  if (!initial.meta.pending) {
    return c.json({ error: "No pending question to answer." }, 409)
  }

  return streamSSE(c, async (stream) => {
    // Same disconnect handling as /messages above.
    const signal = c.req.raw.signal
    const emit = async (event: AgentEvent) => {
      if (signal.aborted) return
      await stream.writeSSE({ data: JSON.stringify(event) })
    }
    try {
      await withSessionLock(id, async () => {
        const session = await getChat(id)
        if (!session) {
          await emit({ type: "error", message: "Session no longer exists." })
          return
        }
        if (!session.meta.pending) {
          await emit({
            type: "error",
            message: "No pending question to answer (already resolved).",
          })
          return
        }
        await resumeWithAnswer({ session, userAnswer: answer, emit, signal })
      })
    } catch (err) {
      await emit({ type: "error", message: (err as Error).message })
    }
  })
})

export default app
