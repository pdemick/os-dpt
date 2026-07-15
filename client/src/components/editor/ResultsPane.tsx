import { XIcon } from "lucide-react"
import { useMemo } from "react"

import type { QueryOk, QueryResponse } from "@shared/types"

import { Button } from "@/components/ui/button"
import { useWorksheets } from "@/hooks/use-worksheets"
import { cn } from "@/lib/utils"

export function ResultsPane() {
  const { session, runtimes, clearResult } = useWorksheets()
  const slug = session.activeSlug
  const runtime = slug ? runtimes[slug] : undefined
  const result = runtime?.lastResult ?? null
  const running = !!runtime?.running

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Header
        result={result}
        running={running}
        onClose={slug ? () => clearResult(slug) : undefined}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {!result && !running && <EmptyState />}
        {running && !result && <RunningState />}
        {result && result.ok && <ResultTable result={result} />}
        {result && !result.ok && (
          <div className="m-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive whitespace-pre-wrap">
            {result.error}
            {result.code && <div className="mt-1 opacity-70">code: {result.code}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function Header({
  result,
  running,
  onClose,
}: {
  result: QueryResponse | null
  running: boolean
  onClose?: () => void
}) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-2 font-mono text-[11px] text-sidebar-foreground/70">
      <div className="flex items-center gap-2 px-1">
        <span className="font-medium text-sidebar-foreground">Results</span>
        {running && <span className="text-sky-500">running…</span>}
        {result && result.ok && (
          <span>
            {result.rowCount} {result.rowCount === 1 ? "row" : "rows"} · {result.durationMs}ms
            {result.truncated && (
              <span className="ml-1 rounded bg-orange-500/20 px-1 text-orange-600 dark:text-orange-300">
                truncated to {result.rows.length}
              </span>
            )}
          </span>
        )}
        {result && !result.ok && <span className="text-red-500">error</span>}
      </div>
      {onClose && result && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          className="size-5"
          aria-label="Close results"
        >
          <XIcon className="size-3" />
        </Button>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Press <kbd className="mx-1 rounded border border-border bg-muted px-1 font-mono">⌘↵</kbd>{" "}
      to run the statement at the cursor.
    </div>
  )
}

function RunningState() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      Running query…
    </div>
  )
}

export function ResultTable({ result }: { result: QueryOk }) {
  const columns = result.columns
  // Stable column keys: name plus index, since duplicates are possible.
  const colKeys = useMemo(() => columns.map((c, i) => `${c.name}::${i}`), [columns])

  if (columns.length === 0) {
    return (
      <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
        Query OK · {result.rowCount} {result.rowCount === 1 ? "row" : "rows"} affected
      </div>
    )
  }

  return (
    <table className="w-max min-w-full border-collapse font-mono text-xs">
      <thead className="sticky top-0 z-10 bg-sidebar text-left">
        <tr>
          <th className="border-b border-sidebar-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
            #
          </th>
          {columns.map((col, i) => (
            <th
              key={colKeys[i]}
              className="border-b border-sidebar-border px-2 py-1 font-medium text-sidebar-foreground"
            >
              {col.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, ri) => (
          <tr key={ri} className={cn(ri % 2 === 1 && "bg-muted/30")}>
            <td className="border-b border-border/40 px-2 py-1 text-muted-foreground">
              {ri + 1}
            </td>
            {row.map((cell, ci) => (
              <td
                key={colKeys[ci] ?? ci}
                className="max-w-[40ch] truncate border-b border-border/40 px-2 py-1"
                title={cell == null ? "" : String(cell)}
              >
                {renderCell(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function renderCell(value: unknown): string {
  if (value === null) return "NULL"
  if (value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}
