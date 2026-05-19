import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWorksheets } from "@/hooks/use-worksheets"
import { useWorksheetUsage } from "@/hooks/use-worksheet-usage"
import { ConnectionPicker } from "./ConnectionPicker"

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0"
  if (usd < 0.01) return "<$0.01"
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

export function StatusBar() {
  const { session, runtimes, dirty, refreshSchema } = useWorksheets()
  const active = session.activeSlug
  const tab = active ? session.openTabs.find((t) => t.slug === active) : null
  const runtime = active ? runtimes[active] : undefined
  const result = runtime?.lastResult
  const usage = useWorksheetUsage(active)
  return (
    <div className="flex h-7 items-center justify-between gap-2 overflow-hidden whitespace-nowrap border-t border-sidebar-border bg-sidebar px-2 font-mono text-[11px] text-sidebar-foreground/70">
      <div className="flex min-w-0 items-center gap-2 px-1">
        <ConnectionPicker />
        {active && (
          <>
            <span className="shrink-0">•</span>
            <span className="truncate">{active}</span>
            {dirty(active) && (
              <span className="shrink-0 text-orange-500">• unsaved</span>
            )}
          </>
        )}
        <QueryStatus running={!!runtime?.running} result={result ?? null} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {usage && usage.calls > 0 && (
          <span
            className="shrink-0 px-1"
            title={`Input ${usage.inputTokens.toLocaleString()} · Output ${usage.outputTokens.toLocaleString()} · Cache read ${usage.cacheReadTokens.toLocaleString()} · Cache write ${usage.cacheCreationTokens.toLocaleString()} · ${usage.calls} call${usage.calls === 1 ? "" : "s"}`}
          >
            {formatTokens(usage.inputTokens)} in / {formatTokens(usage.outputTokens)} out
            {" · "}
            {formatCost(usage.costUsd)}
          </span>
        )}
        {tab && (
          <span className="shrink-0 px-1">
            Ln {tab.cursor.line + 1}, Col {tab.cursor.ch + 1}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void refreshSchema()}
          className="h-5 gap-1 px-1.5 text-[11px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <RefreshCw className="size-3" />
          schema
        </Button>
      </div>
    </div>
  )
}

function QueryStatus({
  running,
  result,
}: {
  running: boolean
  result: import("@shared/types").QueryResponse | null
}) {
  if (running) return <span className="text-sky-500">• running…</span>
  if (!result) return null
  if (result.ok) {
    return (
      <span>
        • {result.rowCount} {result.rowCount === 1 ? "row" : "rows"} ·{" "}
        {result.durationMs}ms
        {result.truncated && " · truncated"}
      </span>
    )
  }
  return <span className="text-red-500" title={result.error}>• error</span>
}
