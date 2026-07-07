import { useCallback, useEffect, useRef, useState } from "react"
import { CheckIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { agentApi } from "@/lib/agent/api"
import { formatShortcut, matchesShortcut, type Shortcut } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"

const TOGGLE: Shortcut = { mod: true, key: "i" }

type Status =
  | { kind: "idle" }
  | { kind: "running"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string }

/**
 * Floating prompt box over the SQL editor. Drives a hidden "quick-edit" agent
 * session bound to the active worksheet: the agent checks context, verifies
 * with run_sql, and stages its final SQL via write_sql — which streams back
 * here as a sql_written event and lands in the editor buffer. No transcript
 * is shown; the editor update IS the output.
 */
export function InlineAgentBox({
  slug,
  connectionId,
  buffer,
  onSql,
}: {
  slug: string
  connectionId: string | null
  buffer: string
  onSql: (slug: string, sql: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)
  // Quick-edit session per worksheet, reused across prompts so follow-ups
  // ("now add a limit") keep their conversation context.
  const sessionsBySlug = useRef<Map<string, { id: string; connectionId: string | null }>>(
    new Map(),
  )
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const streaming = status.kind === "running"

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, TOGGLE)) {
        e.preventDefault()
        setOpen(true)
        // Next tick: the input may not be mounted yet when opening.
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current)
      abortRef.current?.abort()
    },
    [],
  )

  // Abort any in-flight run and reset the status line. Note this only stops
  // the client from consuming events (in particular, sql_written no longer
  // lands in the buffer) — the server finishes the turn on its own.
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus({ kind: "idle" })
  }, [])

  const close = useCallback(() => {
    cancel()
    setOpen(false)
  }, [cancel])

  const ensureSession = useCallback(async (): Promise<string> => {
    let cached = sessionsBySlug.current.get(slug)
    if (!cached) {
      // Reuse this worksheet's existing quick-edit session across remounts so
      // sessions don't pile up on disk, else create one.
      try {
        const all = await agentApi.listSessions()
        const existing = all.find((s) => s.mode === "quick-edit" && s.worksheetSlug === slug)
        if (existing) {
          cached = { id: existing.id, connectionId: existing.connectionId }
        }
      } catch {
        // list is best-effort; fall through to create
      }
      if (!cached) {
        const res = await agentApi.createSession({
          worksheetSlug: slug,
          connectionId,
          mode: "quick-edit",
        })
        cached = { id: res.meta.id, connectionId }
      }
      sessionsBySlug.current.set(slug, cached)
    }
    if (cached.connectionId !== connectionId) {
      // Rebind to the tab's current connection; best-effort (the server
      // rejects inactive connections — keep the old binding then).
      try {
        await agentApi.updateSession(cached.id, { connectionId })
        cached.connectionId = connectionId
      } catch {
        // keep previous binding
      }
    }
    return cached.id
  }, [slug, connectionId])

  const submit = useCallback(async () => {
    const text = prompt.trim()
    if (!text || streaming) return
    if (doneTimer.current) clearTimeout(doneTimer.current)
    const controller = new AbortController()
    abortRef.current = controller
    setStatus({ kind: "running", text: "thinking…" })
    try {
      const sessionId = await ensureSession()
      // The quick-edit prompt promises the agent the worksheet's current
      // contents at the end of every message — append them here.
      const contents = buffer.trim() === "" ? "(empty worksheet)" : buffer
      const message = `${text}\n\n--- current worksheet contents ---\n${contents}`
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
            onSql(event.worksheetSlug, event.sql)
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
      } else {
        setPrompt("")
        setStatus({ kind: "done", text: "Worksheet updated" })
        doneTimer.current = setTimeout(() => setStatus({ kind: "idle" }), 2500)
      }
    } catch (err) {
      // A cancel() aborts the fetch mid-stream; that's not an error and
      // cancel() already reset the status.
      if (!controller.signal.aborted) {
        setStatus({ kind: "error", text: (err as Error).message })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [prompt, streaming, ensureSession, buffer, onSql])

  if (!open) {
    return (
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shadow-md"
          onClick={() => {
            setOpen(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          <SparklesIcon data-icon="inline-start" />
          Edit with AI
          <kbd className="ml-1 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            {formatShortcut(TOGGLE)}
          </kbd>
        </Button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-3 left-1/2 z-10 w-[28rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border bg-popover p-2 shadow-lg">
      <div className="flex items-center gap-1.5">
        <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={prompt}
          // readOnly (not disabled) so the input keeps focus while a run
          // streams and Escape still reaches the handler below.
          readOnly={streaming}
          placeholder="Describe a change to this worksheet…"
          className="h-7 border-none bg-transparent px-1 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              close()
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={streaming ? "Cancel" : "Close"}
          onClick={close}
        >
          <XIcon />
        </Button>
      </div>
      {status.kind !== "idle" ? (
        <div
          className={cn(
            "mt-1 flex items-center gap-1.5 px-1 text-[11px]",
            status.kind === "error"
              ? "text-destructive"
              : status.kind === "done"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
          )}
        >
          {status.kind === "running" ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : status.kind === "done" ? (
            <CheckIcon className="size-3" />
          ) : (
            <XIcon className="size-3" />
          )}
          <span className="truncate">{status.text}</span>
        </div>
      ) : null}
    </div>
  )
}
