import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import type { AgentEvent, ChatSessionMeta } from "@shared/agent"

import { agentApi } from "./api"
import type { TranscriptItem } from "./context-types"
import { hydrateMessages } from "./hydrate"

export type { TranscriptItem }

interface AgentContextValue {
  isOpen: boolean
  open(): Promise<void>
  close(): void
  newChat(): Promise<void>
  session: ChatSessionMeta | null
  items: TranscriptItem[]
  streaming: boolean
  pendingQuestion: string | null
  send(text: string): Promise<void>
  answer(text: string): Promise<void>
  /** Bind the connection the agent's run_sql targets for this chat. */
  setConnection(connectionId: string | null): Promise<void>
  /**
   * Connection the chat is (or will be) bound to: the session's binding once
   * one exists, else the local draft applied when the session is created.
   */
  connectionId: string | null
  /** Past chats whose `worksheetSlug` matches the active worksheet. */
  chatsForActive: ChatSessionMeta[]
  /**
   * True when this is the worksheet panel but no worksheet is active, so the
   * agent runs read-only (write_sql withheld). Surfaces help text in the UI.
   */
  exploreOnly: boolean
  /** Replace the current panel session with the chat at `id`. */
  loadSession(id: string): Promise<void>
  /** Delete a stored chat. If it's the active session, reset the panel. */
  deleteChat(id: string): Promise<void>
}

const AgentContext = createContext<AgentContextValue | null>(null)

/** localStorage key remembering the Chat page's open conversation. */
const LAST_CHAT_KEY = "os-dpt:last-chat-id"

function rid(): string {
  return Math.random().toString(36).slice(2, 10)
}

async function firstActiveConnectionId(): Promise<string | null> {
  try {
    const res = await fetch("/api/connections")
    if (!res.ok) return null
    const data = (await res.json()) as {
      connections?: { id: string; active: boolean }[]
    }
    return data.connections?.find((c) => c.active)?.id ?? null
  } catch {
    return null
  }
}

function apply(items: TranscriptItem[], event: AgentEvent): TranscriptItem[] {
  switch (event.type) {
    case "text_delta": {
      const last = items[items.length - 1]
      if (last?.kind === "assistant_text") {
        const updated: TranscriptItem = { ...last, text: last.text + event.text }
        return [...items.slice(0, -1), updated]
      }
      return [...items, { id: rid(), kind: "assistant_text", text: event.text }]
    }
    case "tool_start":
      return [
        ...items,
        {
          id: rid(),
          kind: "tool",
          toolUseId: event.toolUseId,
          name: event.name,
          status: "running",
          summary: "",
        },
      ]
    case "tool_result":
      return items.map((it) =>
        it.kind === "tool" && it.toolUseId === event.toolUseId
          ? { ...it, status: event.ok ? "ok" : "error", summary: event.summary }
          : it,
      )
    case "sql_written":
      return [
        ...items,
        {
          id: rid(),
          kind: "sql_written",
          worksheetSlug: event.worksheetSlug,
          length: event.sql.length,
        },
      ]
    case "chart_rendered":
      return [...items, { id: rid(), kind: "chart", spec: event.spec }]
    case "ask_user":
      return [
        ...items,
        {
          id: rid(),
          kind: "ask_user",
          toolUseId: event.toolUseId,
          question: event.question,
        },
      ]
    case "error":
      return [...items, { id: rid(), kind: "error", message: event.message }]
    case "usage":
      // Usage/cost is tracked separately (use-worksheet-usage); it produces
      // no transcript row. Handled here to keep the switch exhaustive.
      return items
    case "done":
      return items
    default: {
      // Compile-time exhaustiveness check: if AgentEvent gains a new
      // variant, TypeScript will error here until we handle it.
      const _exhaustive: never = event
      void _exhaustive
      return items
    }
  }
}

export interface AgentChatProviderProps {
  children: ReactNode
  /**
   * Worksheet new chats bind to. `null`/omitted makes this a standalone
   * surface (the Chat page) — sessions carry no worksheet and the agent's
   * write_sql tool is withheld server-side.
   */
  worksheetSlug?: string | null
  /**
   * Called when the agent stages SQL via write_sql. The worksheet side panel
   * mirrors it into the editor buffer; standalone surfaces omit it.
   */
  onSqlWritten?: (slug: string, sql: string) => void
  /**
   * Marks this as the standalone Chat surface, whose sessions intentionally
   * carry `worksheetSlug: null`. Distinguishes a real standalone chat from a
   * side panel that merely has no active worksheet — the latter must not
   * inherit (or create) standalone chats.
   */
  standalone?: boolean
}

export function AgentChatProvider({
  children,
  worksheetSlug = null,
  onSqlWritten,
  standalone = false,
}: AgentChatProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [session, setSession] = useState<ChatSessionMeta | null>(null)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [allChats, setAllChats] = useState<ChatSessionMeta[]>([])
  // Connection choice made before the session exists. Sessions are created
  // lazily on the first message (so empty "Untitled" chats never persist);
  // until then the picker's choice lives here. `undefined` = untouched, so
  // session creation falls back to the first active connection.
  const [draftConnectionId, setDraftConnectionId] = useState<string | null | undefined>(undefined)

  // ref for the bound worksheet slug so consume()/newChat() pick up the live
  // value when the user has switched tabs mid-conversation.
  const activeSlugRef = useRef(worksheetSlug)
  activeSlugRef.current = worksheetSlug

  // Session ids we've already tried to auto-name this session. On a persistent
  // failure (e.g. no API key) the server leaves titleGenerated false so a
  // transient error can be retried, but we don't want to re-hit /auto-name —
  // and re-toast — on every subsequent message. One attempt per session.
  const autoNameAttempted = useRef<Set<string>>(new Set())

  const refreshChats = useCallback(async () => {
    try {
      const list = await agentApi.listSessions()
      setAllChats(list)
    } catch {
      // best-effort — leave existing list in place
    }
  }, [])

  // Load chats once the provider mounts, and re-load when the bound
  // worksheet changes (the filtered view is what feeds the panel).
  useEffect(() => {
    void refreshChats()
  }, [refreshChats, worksheetSlug])


  // Default the draft binding to the first active connection so the picker
  // badge reflects what a new session will be bound to.
  useEffect(() => {
    let cancelled = false
    void firstActiveConnectionId().then((id) => {
      if (!cancelled) setDraftConnectionId((cur) => (cur === undefined ? id : cur))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const ensureSession = useCallback(async (): Promise<ChatSessionMeta> => {
    if (session) return session
    const connectionId =
      draftConnectionId !== undefined ? draftConnectionId : await firstActiveConnectionId()
    const res = await agentApi.createSession({
      worksheetSlug,
      connectionId,
      standalone,
    })
    setSession(res.meta)
    return res.meta
  }, [session, draftConnectionId, worksheetSlug, standalone])

  const consume = useCallback(
    async (stream: AsyncGenerator<AgentEvent>) => {
      try {
        for await (const event of stream) {
          setItems((prev) => apply(prev, event))
          if (event.type === "sql_written") {
            onSqlWritten?.(event.worksheetSlug, event.sql)
          }
          if (event.type === "ask_user") {
            setPendingQuestion(event.question)
          }
        }
      } catch (err) {
        setItems((prev) => apply(prev, { type: "error", message: (err as Error).message }))
      } finally {
        setStreaming(false)
      }
    },
    [onSqlWritten],
  )

  // Opening the panel doesn't create a session — that happens lazily on the
  // first message (send() → ensureSession), so browsing around never leaves
  // empty "Untitled" chats behind.
  const open = useCallback(async () => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const newChat = useCallback(async () => {
    // Just reset the panel — the session (and its history entry) is created
    // when the user actually sends a message. The previous chat stays as-is.
    setSession(null)
    setItems([])
    setPendingQuestion(null)
    setStreaming(false)
    setDraftConnectionId(await firstActiveConnectionId())
  }, [])

  const loadSession = useCallback(
    async (id: string) => {
      const res = await agentApi.getSession(id)
      setSession(res.meta)
      setItems(hydrateMessages(res.messages))
      setPendingQuestion(res.meta.pending?.question ?? null)
      setStreaming(false)
      setIsOpen(true)
    },
    [],
  )

  // Keep the standalone Chat page's conversation across refreshes and view
  // switches: remember the open session's id and reload it on mount. The
  // guard ref makes the first run restore-only, so the initial null session
  // doesn't clear the saved id before it's read.
  const restoredChatRef = useRef(false)
  useEffect(() => {
    if (!standalone) return
    if (!restoredChatRef.current) {
      restoredChatRef.current = true
      const saved = localStorage.getItem(LAST_CHAT_KEY)
      if (saved) {
        loadSession(saved).catch(() => {
          // stale id (chat deleted since) — forget it
          localStorage.removeItem(LAST_CHAT_KEY)
        })
      }
      return
    }
    if (session) localStorage.setItem(LAST_CHAT_KEY, session.id)
    else localStorage.removeItem(LAST_CHAT_KEY)
  }, [standalone, session, loadSession])

  const deleteChat = useCallback(
    async (id: string) => {
      await agentApi.deleteSession(id).catch(() => {})
      if (session?.id === id) {
        setSession(null)
        setItems([])
        setPendingQuestion(null)
        setStreaming(false)
      }
      await refreshChats()
    },
    [session, refreshChats],
  )

  const send = useCallback(
    async (text: string) => {
      if (streaming || pendingQuestion) return
      const meta = await ensureSession()
      // A fresh session has no title yet; its first message is what we name on.
      // The ref guard ensures we attempt this once per session even when the
      // server keeps titleGenerated false after a (retryable) model error.
      const isFirstMessage = !meta.titleGenerated && !autoNameAttempted.current.has(meta.id)
      setItems((prev) => [...prev, { id: rid(), kind: "user", text }])
      setStreaming(true)
      let stream: AsyncGenerator<AgentEvent>
      try {
        stream = await agentApi.sendMessage(meta.id, text)
      } catch (err) {
        // streamPost throws before any SSE is read (network down, 4xx).
        // consume()'s finally never runs, so reset streaming here.
        setItems((prev) => apply(prev, { type: "error", message: (err as Error).message }))
        setStreaming(false)
        return
      }
      await consume(stream)
      // The server set a truncated title when the message landed. On the first
      // turn, ask it to upgrade that to an LLM summary (best-effort) before we
      // refresh, so the history list reflects the final title in one pass.
      if (isFirstMessage) {
        autoNameAttempted.current.add(meta.id)
        try {
          const res = await agentApi.autoNameSession(meta.id)
          if (!res.skipped && res.title) {
            const title = res.title
            setSession((s) => (s && s.id === meta.id ? { ...s, title, titleGenerated: true } : s))
          } else if (res.reason === "model-error") {
            // Keep the raw model error in the console for debugging; show the
            // user a friendly message rather than leaking SDK internals.
            if (res.error) console.warn("auto-name conversation failed:", res.error)
            toast.error("Couldn't auto-name this conversation", {
              description: "Falling back to a truncated title.",
            })
          }
        } catch {
          // best-effort — the truncated title stays in place
        }
      }
      // First message in a fresh session updates the title server-side;
      // pull the new meta so the history list shows it.
      await refreshChats()
    },
    [ensureSession, streaming, pendingQuestion, consume, refreshChats],
  )

  const answer = useCallback(
    async (text: string) => {
      if (!pendingQuestion || !session) return
      setItems((prev) => [...prev, { id: rid(), kind: "user", text }])
      setPendingQuestion(null)
      setStreaming(true)
      let stream: AsyncGenerator<AgentEvent>
      try {
        stream = await agentApi.respond(session.id, text)
      } catch (err) {
        setItems((prev) => apply(prev, { type: "error", message: (err as Error).message }))
        setStreaming(false)
        return
      }
      await consume(stream)
    },
    [pendingQuestion, session, consume],
  )

  const setConnection = useCallback(
    async (connectionId: string | null) => {
      // No session yet: stash the choice locally; it's applied when the first
      // message creates the session.
      if (!session) {
        setDraftConnectionId(connectionId)
        return
      }
      const updated = await agentApi.updateSession(session.id, { connectionId })
      setSession(updated)
    },
    [session],
  )

  // Chats relevant to this surface's binding: the standalone (null-worksheet)
  // chats for the Chat page, or the active worksheet's chats for the side
  // panel. With no active worksheet the panel stays empty rather than falling
  // back to the standalone chats (which would collide with the Chat page).
  const chatsForActive = useMemo(() => {
    if (standalone) return allChats.filter((c) => c.standalone)
    if (!worksheetSlug) return []
    return allChats.filter((c) => !c.standalone && c.worksheetSlug === worksheetSlug)
  }, [allChats, standalone, worksheetSlug])

  const connectionId = session ? session.connectionId : (draftConnectionId ?? null)

  // The worksheet panel with no active worksheet: the agent runs read-only
  // (write_sql is withheld server-side because worksheetSlug is null). The
  // Chat page (standalone) frames this in its own UI, so it's excluded here.
  const exploreOnly = !standalone && !worksheetSlug

  const value = useMemo<AgentContextValue>(
    () => ({
      isOpen,
      open,
      close,
      newChat,
      session,
      items,
      streaming,
      pendingQuestion,
      send,
      answer,
      setConnection,
      connectionId,
      chatsForActive,
      exploreOnly,
      loadSession,
      deleteChat,
    }),
    [
      isOpen,
      open,
      close,
      newChat,
      session,
      items,
      streaming,
      pendingQuestion,
      send,
      answer,
      setConnection,
      connectionId,
      chatsForActive,
      exploreOnly,
      loadSession,
      deleteChat,
    ],
  )

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error("useAgent must be used inside <AgentChatProvider>")
  return ctx
}
