import { useCallback, useEffect, useRef, useState } from "react"
import { CheckIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useQuickEdit } from "@/lib/agent/use-quick-edit"
import { formatShortcut, matchesShortcut, type Shortcut } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"

const TOGGLE: Shortcut = { mod: true, key: "i" }

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
  const inputRef = useRef<HTMLInputElement>(null)

  const { status, streaming, submit, cancel } = useQuickEdit({
    worksheetSlug: slug,
    connectionId,
    contextLabel: "current worksheet contents",
    emptyText: "(empty worksheet)",
    doneText: "Worksheet updated",
    onSql: (sql, worksheetSlug) => {
      if (worksheetSlug) onSql(worksheetSlug, sql)
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, TOGGLE)) return
      // Don't steal the shortcut while the user is typing somewhere else
      // (e.g. the chat side panel's composer). The CodeMirror editor is
      // contenteditable too, but it's exactly where the shortcut should
      // work, so it's exempted.
      const target = e.target instanceof HTMLElement ? e.target : null
      const typing =
        !!target &&
        (target.isContentEditable || !!target.closest("input, textarea, select"))
      if (typing && !target.closest(".cm-editor")) return
      e.preventDefault()
      setOpen(true)
      // Next tick: the input may not be mounted yet when opening.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const close = useCallback(() => {
    cancel()
    setOpen(false)
  }, [cancel])

  const run = useCallback(async () => {
    if (streaming) return
    const ok = await submit(prompt, buffer)
    if (ok) setPrompt("")
  }, [streaming, submit, prompt, buffer])

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
              void run()
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
