import { useCallback, useEffect, useRef, useState } from "react"

import { agentApi } from "@/lib/agent/api"

export type QuickEditStatus =
  | { kind: "idle" }
  | { kind: "running"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string }

interface Options {
  /**
   * Worksheet the hidden quick-edit session binds to, or null for a
   * standalone editor (e.g. a dashboard chart's source query). Worksheet
   * sessions are found-and-reused across mounts so they don't pile up on
   * disk; slug-less sessions are created per hook instance and deleted by
   * dispose() since nothing else could ever find them again.
   */
  worksheetSlug: string | null
  connectionId: string | null
  /** Heading over the buffer contents appended to each message. */
  contextLabel: string
  /** Stand-in for an empty buffer, e.g. "(empty worksheet)". */
  emptyText: string
  /** Status line shown when a run lands, e.g. "Worksheet updated". */
  doneText: string
  onSql: (sql: string, worksheetSlug: string | null) => void
}

/**
 * Drives a hidden "quick-edit" agent session: the agent checks context,
 * verifies with run_sql, and stages its final SQL via write_sql — which
 * streams back as a sql_written event into `onSql`. No transcript is shown;
 * the editor update IS the output. Extracted from InlineAgentBox so any
 * SQL-buffer surface (worksheet editor, chart query editor) can embed it.
 */
export function useQuickEdit({
  worksheetSlug,
  connectionId,
  contextLabel,
  emptyText,
  doneText,
  onSql,
}: Options) {
  const [status, setStatus] = useState<QuickEditStatus>({ kind: "idle" })
  // Sessions per binding key, reused across prompts so follow-ups ("now add
  // a limit") keep their conversation context. Reuse is safe long-term: the
  // server caps quick-edit history to the last few turns.
  const sessions = useRef<Map<string, { id: string; connectionId: string | null }>>(new Map())
  // Slug-less session ids this hook created, for best-effort cleanup.
  const owned = useRef<Set<string>>(new Set())
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const onSqlRef = useRef(onSql)
  onSqlRef.current = onSql

  const streaming = status.kind === "running"

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current)
      abortRef.current?.abort()
    },
    [],
  )

  const sessionKey = worksheetSlug ?? "__standalone__"

  const ensureSession = useCallback(async (): Promise<string> => {
    let cached = sessions.current.get(sessionKey)
    if (!cached && worksheetSlug) {
      // Reuse this worksheet's existing quick-edit session across remounts so
      // sessions don't pile up on disk, else create one.
      try {
        const all = await agentApi.listSessions()
        const existing = all.find(
          (s) => s.mode === "quick-edit" && s.worksheetSlug === worksheetSlug,
        )
        if (existing) {
          cached = { id: existing.id, connectionId: existing.connectionId }
        }
      } catch {
        // list is best-effort; fall through to create
      }
    }
    if (!cached) {
      const res = await agentApi.createSession({
        worksheetSlug,
        connectionId,
        mode: "quick-edit",
      })
      cached = { id: res.meta.id, connectionId }
      if (!worksheetSlug) owned.current.add(res.meta.id)
    }
    sessions.current.set(sessionKey, cached)
    if (cached.connectionId !== connectionId) {
      // Rebind to the current connection; best-effort (the server rejects
      // inactive connections — keep the old binding then).
      try {
        await agentApi.updateSession(cached.id, { connectionId })
        cached.connectionId = connectionId
      } catch {
        // keep previous binding
      }
    }
    return cached.id
  }, [sessionKey, worksheetSlug, connectionId])

  // Abort any in-flight run and reset the status line. The dropped connection
  // also aborts the turn server-side at its next safe point, so a canceled
  // run's write_sql never lands in the buffer OR any on-disk draft.
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus({ kind: "idle" })
  }, [])

  /** cancel() plus best-effort deletion of hidden slug-less sessions. */
  const dispose = useCallback(() => {
    cancel()
    sessions.current.clear()
    for (const id of owned.current) {
      void agentApi.deleteSession(id).catch(() => {})
    }
    owned.current.clear()
  }, [cancel])

  /** Runs one prompt against the buffer. Resolves true when the run landed. */
  const submit = useCallback(
    async (prompt: string, buffer: string): Promise<boolean> => {
      const text = prompt.trim()
      if (!text || abortRef.current) return false
      if (doneTimer.current) clearTimeout(doneTimer.current)
      const controller = new AbortController()
      abortRef.current = controller
      setStatus({ kind: "running", text: "thinking…" })
      try {
        const sessionId = await ensureSession()
        // The quick-edit prompt promises the agent the buffer's current
        // contents at the end of every message — append them here.
        const contents = buffer.trim() === "" ? emptyText : buffer
        const message = `${text}\n\n--- ${contextLabel} ---\n${contents}`
        const stream = await agentApi.sendMessage(sessionId, message, controller.signal)
        let failed: string | null = null
        for await (const event of stream) {
          switch (event.type) {
            case "tool_start": {
              const queryName =
                event.name === "run_sql"
                  ? (event.input as { name?: unknown } | null)?.name
                  : undefined
              setStatus({
                kind: "running",
                text: typeof queryName === "string" ? `run_sql — ${queryName}` : event.name,
              })
              break
            }
            case "sql_written":
              onSqlRef.current(event.sql, event.worksheetSlug)
              break
            case "error":
              failed = event.message
              break
            default:
              break
          }
        }
        if (failed) {
          setStatus({ kind: "error", text: failed })
          return false
        }
        setStatus({ kind: "done", text: doneText })
        doneTimer.current = setTimeout(() => setStatus({ kind: "idle" }), 2500)
        return true
      } catch (err) {
        // A cancel() aborts the fetch mid-stream; that's not an error and
        // cancel() already reset the status.
        if (!controller.signal.aborted) {
          setStatus({ kind: "error", text: (err as Error).message })
        }
        return false
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [ensureSession, contextLabel, emptyText, doneText],
  )

  return { status, streaming, submit, cancel, dispose }
}
