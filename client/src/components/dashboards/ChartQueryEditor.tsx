import { useCallback, useEffect, useState } from "react"
import { CheckIcon, Loader2Icon, PlayIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import type { Dashboard, DashboardChart } from "@shared/dashboards"
import type { QueryResponse, SQLNamespace } from "@shared/types"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor"
import { ResultTable } from "@/components/editor/ResultsPane"
import { useQuickEdit } from "@/lib/agent/use-quick-edit"
import { dashboardsApi } from "@/lib/dashboards/api"
import { api as worksheetsApi } from "@/lib/worksheets/api"
import { cn } from "@/lib/utils"

/**
 * "View source query" editor for a dashboard chart: the chart's SQL in a
 * CodeMirror buffer with Run + results, an AI prompt driving a slug-less
 * quick-edit session (write_sql streams straight back into the buffer), and
 * Save to persist the SQL onto the chart.
 */
export function ChartQueryEditor({
  dashboardSlug,
  chart,
  open,
  onOpenChange,
  onSaved,
}: {
  dashboardSlug: string
  chart: DashboardChart
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the updated dashboard after a save; the parent refreshes the chart. */
  onSaved: (dashboard: Dashboard) => void
}) {
  const [sql, setSql] = useState(chart.sql)
  const [schema, setSchema] = useState<SQLNamespace>({})
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  const quickEdit = useQuickEdit({
    worksheetSlug: null,
    connectionId: chart.connectionId,
    contextLabel: "current query",
    emptyText: "(empty query)",
    doneText: "Query updated",
    onSql: (next) => setSql(next),
  })
  const { dispose } = quickEdit

  // Reset the editing state whenever the dialog opens on a chart.
  useEffect(() => {
    if (!open) return
    setSql(chart.sql)
    setResult(null)
    // Schema-aware autocomplete when this connection's schema is cached
    // server-side; an empty namespace just means plain SQL completion.
    if (chart.connectionId) {
      worksheetsApi
        .getConnectionSchema(chart.connectionId)
        .then(setSchema)
        .catch(() => setSchema({}))
    }
    // The chart prop is stable while the dialog is open (edits land on save).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chart.id])

  // Closing the dialog tears down the hidden quick-edit session.
  useEffect(() => {
    if (!open) dispose()
  }, [open, dispose])
  useEffect(() => () => dispose(), [dispose])

  const run = useCallback(
    async (text: string) => {
      if (!chart.connectionId || running) return
      setRunning(true)
      try {
        setResult(await worksheetsApi.runQuery(chart.connectionId, text))
      } catch (err) {
        // runQuery folds HTTP/SQL failures into ok:false; only network-level
        // errors reach here. Surface them in the same results slot.
        setResult({ ok: false, error: (err as Error).message })
      } finally {
        setRunning(false)
      }
    },
    [chart.connectionId, running],
  )

  const save = async () => {
    setSaving(true)
    try {
      const dashboard = await dashboardsApi.updateChart(dashboardSlug, chart.id, { sql })
      toast.success("Query saved")
      onSaved(dashboard)
      onOpenChange(false)
    } catch (err) {
      toast.error("Couldn't save query", { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // Warn when a run's result no longer carries the columns the chart plots —
  // it would render as "Nothing to chart." after saving.
  const missingColumns =
    result?.ok === true && result.columns.length > 0
      ? [chart.x, ...chart.series.map((s) => s.key)].filter(
          (key) => !result.columns.some((c) => c.name === key),
        )
      : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{chart.title}</DialogTitle>
          <DialogDescription>
            Edit this chart's source query — by hand, or describe the change and let the agent
            rewrite it. Save re-runs the chart with the new SQL.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <CodeMirrorEditor
            key={chart.id}
            value={sql}
            onChange={setSql}
            onExecute={(statement) => void run(statement)}
            schema={schema}
          />
        </div>

        <QuickEditPrompt quickEdit={quickEdit} buffer={sql} />

        {result ? (
          <div className="h-52 shrink-0 overflow-auto rounded-md border border-border">
            {result.ok ? (
              <>
                {missingColumns.length > 0 ? (
                  <div className="border-b border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    Result is missing column{missingColumns.length === 1 ? "" : "s"} the chart
                    plots: {missingColumns.join(", ")} — it may render empty.
                  </div>
                ) : null}
                <ResultTable result={result} />
              </>
            ) : (
              <div className="m-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 font-mono text-xs whitespace-pre-wrap text-destructive">
                {result.error === "not_connected"
                  ? "Connection not connected — connect it in Connections."
                  : result.error}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={!chart.connectionId || running}
            title={chart.connectionId ? undefined : "This chart has no connection"}
            onClick={() => void run(sql)}
          >
            {running ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            Run
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || sql.trim() === ""} onClick={() => void save()}>
            {saving ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The chat-to-SQL row: prompt input + agent status, à la InlineAgentBox. */
function QuickEditPrompt({
  quickEdit,
  buffer,
}: {
  quickEdit: ReturnType<typeof useQuickEdit>
  buffer: string
}) {
  const { status, streaming, submit, cancel } = quickEdit
  const [prompt, setPrompt] = useState("")

  const run = async () => {
    if (streaming) return
    const ok = await submit(prompt, buffer)
    if (ok) setPrompt("")
  }

  return (
    <div className="shrink-0 rounded-md border border-border p-1.5">
      <div className="flex items-center gap-1.5">
        <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={prompt}
          readOnly={streaming}
          placeholder="Describe a change to this query…"
          className="h-7 border-none bg-transparent px-1 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void run()
            }
          }}
        />
        {streaming ? (
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Cancel" onClick={cancel}>
            <XIcon />
          </Button>
        ) : null}
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
