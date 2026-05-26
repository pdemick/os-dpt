import { promises as fs } from "node:fs"
import crypto from "node:crypto"

import type Anthropic from "@anthropic-ai/sdk"

import {
  emptyTotals,
  type ChatSessionMeta,
  type PendingAsk,
  type UsageEntry,
} from "@shared/agent.ts"

import { writeAtomic } from "../lib/fs-atomic.ts"
import { assertSafeChatId, paths } from "../workspace.ts"

export type AnthropicMessage = Anthropic.MessageParam

export interface ChatSession {
  meta: ChatSessionMeta
  messages: AnthropicMessage[]
}

export interface CreateChatInput {
  worksheetSlug?: string | null
  connectionId?: string | null
  title?: string | null
  /** Marks a Chat-page session; see ChatSessionMeta.standalone. */
  standalone?: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

function freshMeta(input: CreateChatInput): ChatSessionMeta {
  const now = nowIso()
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    title: input.title ?? null,
    titleGenerated: false,
    worksheetSlug: input.worksheetSlug ?? null,
    standalone: input.standalone ?? false,
    connectionId: input.connectionId ?? null,
    pending: null,
    usage: [],
    totals: emptyTotals(),
  }
}

/**
 * Older sessions on disk predate token tracking. Backfill empty usage
 * fields on read so callers can treat them as always-present.
 */
function ensureUsageFields(session: ChatSession): ChatSession {
  if (!Array.isArray(session.meta.usage)) session.meta.usage = []
  if (!session.meta.totals) session.meta.totals = emptyTotals()
  // Sessions predating the standalone flag are all worksheet-panel origin
  // (the Chat page is newer); default them to non-standalone.
  if (typeof session.meta.standalone !== "boolean") session.meta.standalone = false
  // Sessions predating LLM auto-naming carry a (possibly truncated) title but
  // no flag; treat them as already-named so we don't re-name old chats.
  if (typeof session.meta.titleGenerated !== "boolean") {
    session.meta.titleGenerated = session.meta.title != null
  }
  return session
}

export async function createChat(input: CreateChatInput): Promise<ChatSession> {
  const session: ChatSession = { meta: freshMeta(input), messages: [] }
  await persist(session)
  return session
}

export async function getChat(id: string): Promise<ChatSession | null> {
  assertSafeChatId(id)
  try {
    const raw = await fs.readFile(paths.chat(id), "utf8")
    return ensureUsageFields(JSON.parse(raw) as ChatSession)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

// TODO: O(n) disk I/O — every list call reads + JSON.parses every
// transcript. Fine while there are a few chats; once the "recent chats"
// UI lands, split meta out into a separate file per chat (or an index)
// so listChats doesn't pull full transcripts into memory.
export async function listChats(): Promise<ChatSessionMeta[]> {
  const entries = await fs.readdir(paths.chats()).catch(() => [])
  const out: ChatSessionMeta[] = []
  for (const f of entries) {
    if (!f.endsWith(".json")) continue
    try {
      const raw = await fs.readFile(paths.chat(f.slice(0, -5)), "utf8")
      const data = ensureUsageFields(JSON.parse(raw) as ChatSession)
      out.push(data.meta)
    } catch {
      // skip unreadable / malformed transcripts; don't fail the whole list
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out
}

export async function deleteChat(id: string): Promise<void> {
  assertSafeChatId(id)
  await fs.rm(paths.chat(id), { force: true })
}

export async function appendMessage(
  session: ChatSession,
  message: AnthropicMessage,
): Promise<void> {
  session.messages.push(message)
  session.meta.updatedAt = nowIso()
  await persist(session)
}

export async function setPending(
  session: ChatSession,
  pending: PendingAsk,
): Promise<void> {
  session.meta.pending = pending
  session.meta.updatedAt = nowIso()
  await persist(session)
}

export async function clearPending(session: ChatSession): Promise<void> {
  session.meta.pending = null
  session.meta.updatedAt = nowIso()
  await persist(session)
}

export async function recordUsage(
  session: ChatSession,
  entry: UsageEntry,
): Promise<void> {
  session.meta.usage.push(entry)
  const t = session.meta.totals
  t.inputTokens += entry.inputTokens
  t.outputTokens += entry.outputTokens
  t.cacheCreationTokens += entry.cacheCreationTokens
  t.cacheReadTokens += entry.cacheReadTokens
  t.costUsd += entry.costUsd
  t.calls += 1
  session.meta.updatedAt = nowIso()
  await persist(session)
}

export async function setTitle(
  session: ChatSession,
  title: string,
  generated = false,
): Promise<void> {
  session.meta.title = title
  // Only the LLM namer flips this; the truncation fallback leaves it false so
  // a later auto-name attempt can still upgrade the title.
  if (generated) session.meta.titleGenerated = true
  session.meta.updatedAt = nowIso()
  await persist(session)
}

/** Bind (or clear) the connection run_sql defaults to for this chat. */
export async function setConnection(
  session: ChatSession,
  connectionId: string | null,
): Promise<void> {
  session.meta.connectionId = connectionId
  session.meta.updatedAt = nowIso()
  await persist(session)
}

/** Flush in-memory mutations (e.g. message-block edits) to disk. */
export async function persistSession(session: ChatSession): Promise<void> {
  session.meta.updatedAt = nowIso()
  await persist(session)
}

async function persist(session: ChatSession): Promise<void> {
  assertSafeChatId(session.meta.id)
  await writeAtomic(paths.chat(session.meta.id), JSON.stringify(session, null, 2))
}
