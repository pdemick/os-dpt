import { memo, useContext, useState } from "react"
import type { ReactNode } from "react"
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  FilePlus2Icon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import { Streamdown } from "streamdown"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAgent } from "@/lib/agent/context"
import type { TranscriptItem } from "@/lib/agent/context"
import { cn } from "@/lib/utils"
import { api as worksheetsApi } from "@/lib/worksheets/api"
import { WorksheetsContext } from "@/lib/worksheets/context-object"

import { ChartView } from "./ChartView"

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>

function statusIcon(status: ToolItem["status"]) {
  return status === "running" ? (
    <Loader2Icon className="size-3 animate-spin" />
  ) : status === "error" ? (
    <XIcon className="size-3" />
  ) : (
    <CheckIcon className="size-3" />
  )
}

/**
 * A run_sql call rendered as an expandable row: the header toggles a SQL
 * preview with actions to copy the SQL to the clipboard or export it into a
 * freshly created worksheet.
 */
function RunSqlRow({
  item,
  sql,
  queryName,
}: {
  item: ToolItem
  sql: string
  /** Model-supplied name for the query (the tool input's `name`), when present. */
  queryName?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { connectionId: chatConnectionId } = useAgent()
  // Present only when rendered inside the Worksheets view; the standalone
  // Chat page has no provider mounted.
  const worksheets = useContext(WorksheetsContext)

  // The connection this query actually ran against: an explicit input
  // override, else the chat's bound connection (mirrors run_sql's own
  // resolution server-side).
  const inputConnId = (item.input as { connection_id?: unknown } | null)?.connection_id
  const sourceConnectionId = typeof inputConnId === "string" ? inputConnId : chatConnectionId

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      toast.success("SQL copied to clipboard")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  const copyToWorksheet = async () => {
    setExporting(true)
    try {
      const meta = await worksheetsApi.createWorksheet(queryName)
      await worksheetsApi.saveWorksheet(meta.slug, sql)
      let name = meta.name
      if (queryName) {
        // The query already has a model-supplied name — reuse it instead of
        // paying for another LLM naming call.
        try {
          name = (await worksheetsApi.renameWorksheet(meta.slug, queryName)).name
        } catch {
          // best-effort — the slug-derived name stays in place
        }
      } else {
        try {
          const named = await worksheetsApi.autoNameWorksheet(meta.slug, sql)
          if (!named.skipped && named.name) name = named.name
        } catch {
          // best-effort — the default name stays in place
        }
      }
      // Bind the new worksheet to the connection the query ran against
      // (best-effort). Inside the Worksheets view, go through the provider —
      // it owns the session in memory and its debounced writes would clobber
      // a direct API write; opening the tab also surfaces the export
      // immediately. On the standalone Chat page no provider is mounted, so
      // patch the persisted session directly and the binding hydrates when
      // the Worksheets view next mounts.
      try {
        if (worksheets) {
          await worksheets.refreshList()
          await worksheets.openTab(meta.slug)
          if (sourceConnectionId) {
            worksheets.setTabConnection(meta.slug, sourceConnectionId, { explicit: true })
          }
        } else if (sourceConnectionId) {
          const session = await worksheetsApi.getSession()
          await worksheetsApi.putSession({
            ...session,
            openTabs: [
              ...session.openTabs.filter((t) => t.slug !== meta.slug),
              {
                slug: meta.slug,
                cursor: { line: 0, ch: 0 },
                scrollTop: 0,
                connectionId: sourceConnectionId,
                connectionExplicit: true,
              },
            ],
            activeSlug: meta.slug,
          })
        }
      } catch {
        // best-effort — the worksheet exists either way, just unbound
      }
      toast.success(`Created worksheet “${name}”`)
    } catch (err) {
      toast.error("Couldn't create worksheet", { description: (err as Error).message })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border text-xs",
        item.status === "error"
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2 py-1 text-left"
      >
        {statusIcon(item.status)}
        <span className="font-mono">{item.name}</span>
        {queryName ? (
          <span className="truncate font-medium text-foreground/80">{queryName}</span>
        ) : null}
        {item.summary ? <span className="truncate">— {item.summary}</span> : null}
        <ChevronRightIcon
          className={cn("ml-auto size-3 shrink-0 transition-transform", expanded && "rotate-90")}
        />
      </button>
      {expanded ? (
        <div className="border-t border-border/60 px-2 py-1.5">
          <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {sql}
          </pre>
          <div className="mt-1.5 flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={() => void copy()}>
              <CopyIcon data-icon="inline-start" /> Copy
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={exporting}
              onClick={() => void copyToWorksheet()}
            >
              {exporting ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <FilePlus2Icon data-icon="inline-start" />
              )}{" "}
              Copy to worksheet
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function TranscriptRow({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
            {item.text}
          </div>
        </div>
      )
    case "assistant_text":
      return (
        <div className="flex justify-start">
          <div
            className={cn(
              "max-w-[85%] text-sm leading-relaxed",
              "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
              "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
              "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_li]:my-0.5",
              "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
              "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
              "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
              "[&_strong]:font-semibold",
              "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
              "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
              "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-2 [&_pre]:text-xs",
              "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
              "[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs",
              "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
              "[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
              "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
              "[&_hr]:my-3 [&_hr]:border-border",
            )}
          >
            <Streamdown>{item.text}</Streamdown>
          </div>
        </div>
      )
    case "tool": {
      // run_sql calls get an expandable row exposing the SQL; a malformed
      // input (no sql string) falls through to the generic row.
      const input =
        item.name === "run_sql" ? (item.input as { sql?: unknown; name?: unknown } | null) : null
      if (typeof input?.sql === "string" && input.sql.trim() !== "") {
        const queryName = typeof input.name === "string" ? input.name.trim() : ""
        return <RunSqlRow item={item} sql={input.sql} queryName={queryName || undefined} />
      }
      return (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
            item.status === "error"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {statusIcon(item.status)}
          <span className="font-mono">{item.name}</span>
          {item.summary ? <span className="truncate">— {item.summary}</span> : null}
        </div>
      )
    }
    case "sql_written":
      return (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-muted-foreground">
          → wrote {item.length} chars to <span className="font-mono">{item.worksheetSlug}</span>{" "}
          draft
        </div>
      )
    case "chart":
      return <ChartView spec={item.spec} />
    case "ask_user":
      return (
        <div className="rounded-md border border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          ❓ {item.question}
        </div>
      )
    case "error":
      return (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {item.message}
        </div>
      )
  }
}

const MemoTranscriptRow = memo(TranscriptRow, (prev, next) => prev.item === next.item)

/**
 * Renders a conversation: the transcript rows, a streaming indicator while the
 * agent works, and an empty state before anything has been said.
 */
export function Transcript({
  items,
  streaming,
  pendingQuestion,
  emptyState,
}: {
  items: TranscriptItem[]
  streaming: boolean
  pendingQuestion: string | null
  emptyState: ReactNode
}) {
  if (items.length === 0 && !streaming) {
    return <div className="text-xs text-muted-foreground">{emptyState}</div>
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <MemoTranscriptRow key={it.id} item={it} />
      ))}
      {streaming && !pendingQuestion ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" /> streaming…
        </div>
      ) : null}
    </div>
  )
}
