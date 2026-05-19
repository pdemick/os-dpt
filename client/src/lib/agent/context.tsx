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

import type { AgentEvent, ChatSessionMeta } from "@shared/agent"

import { useWorksheets } from "@/hooks/use-worksheets"

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
  /** Past chats whose `worksheetSlug` matches the active worksheet. */
  chatsForActive: ChatSessionMeta[]
  /** Replace the current panel session with the chat at `id`. */
  loadSession(id: string): Promise<void>
  /** Delete a stored chat. If it's the active session, reset the panel. */
  deleteChat(id: string): Promise<void>
}

const AgentContext = createContext<AgentContextValue | null>(null)

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

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { session: editorSession, updateBuffer } = useWorksheets()
  const [isOpen, setIsOpen] = useState(false)
  const [session, setSession] = useState<ChatSessionMeta | null>(null)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [streaming, setStreaming] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [allChats, setAllChats] = useState<ChatSessionMeta[]>([])

  // ref for the active worksheet slug so consume() picks up the live value
  // when the user has switched tabs mid-conversation.
  const activeSlugRef = useRef(editorSession.activeSlug)
  activeSlugRef.current = editorSession.activeSlug

  const refreshChats = useCallback(async () => {
    try {
      const list = await agentApi.listSessions()
      setAllChats(list)
    } catch {
      // best-effort — leave existing list in place
    }
  }, [])

  // Load chats once the provider mounts, and re-load when the active
  // worksheet changes (the filtered view is what feeds the panel).
  useEffect(() => {
    void refreshChats()
  }, [refreshChats, editorSession.activeSlug])

  const ensureSession = useCallback(async (): Promise<ChatSessionMeta> => {
    if (session) return session
    const connectionId = await firstActiveConnectionId()
    const res = await agentApi.createSession({
      worksheetSlug: editorSession.activeSlug,
      connectionId,
    })
    setSession(res.meta)
    return res.meta
  }, [session, editorSession.activeSlug])

  const consume = useCallback(
    async (stream: AsyncGenerator<AgentEvent>) => {
      try {
        for await (const event of stream) {
          setItems((prev) => apply(prev, event))
          if (event.type === "sql_written") {
            updateBuffer(event.worksheetSlug, event.sql)
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
    [updateBuffer],
  )

  const open = useCallback(async () => {
    setIsOpen(true)
    await ensureSession()
  }, [ensureSession])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const newChat = useCallback(async () => {
    if (session) {
      await agentApi.deleteSession(session.id).catch(() => {})
    }
    setSession(null)
    setItems([])
    setPendingQuestion(null)
    setStreaming(false)
    // recreate immediately so the panel is ready to send
    const connectionId = await firstActiveConnectionId()
    const res = await agentApi.createSession({
      worksheetSlug: activeSlugRef.current,
      connectionId,
    })
    setSession(res.meta)
    await refreshChats()
  }, [session, refreshChats])

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

  const chatsForActive = useMemo(
    () =>
      editorSession.activeSlug
        ? allChats.filter((c) => c.worksheetSlug === editorSession.activeSlug)
        : [],
    [allChats, editorSession.activeSlug],
  )

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
      chatsForActive,
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
      chatsForActive,
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
