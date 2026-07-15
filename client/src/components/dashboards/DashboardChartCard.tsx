import {
  DatabaseZapIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UnplugIcon,
} from "lucide-react"

import type { ChartSpec } from "@shared/agent"
import type { DashboardChart } from "@shared/dashboards"

import { ChartView } from "@/components/agent/ChartView"
import { Button } from "@/components/ui/button"
import type { ChartDataState } from "@/lib/dashboards/use-dashboard-data"

export function DashboardChartCard({
  chart,
  state,
  onEditSource,
  onRefresh,
  onRemove,
}: {
  chart: DashboardChart
  state: ChartDataState | undefined
  /** Opens the source-query editor. Absent until the editor is wired up. */
  onEditSource?: () => void
  onRefresh: () => void
  onRemove: () => void
}) {
  // Hover actions in the card header; ChartView shows them next to
  // copy-as-image, placeholders in their own header row.
  const headerActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Refresh"
        onClick={onRefresh}
        disabled={state?.kind === "loading"}
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <RefreshCwIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Remove from dashboard"
        onClick={onRemove}
        className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
      >
        <Trash2Icon />
      </Button>
    </>
  )

  if (state?.kind === "ok") {
    // Reconstruct the self-contained spec ChartView consumes: the stored
    // chart definition plus the freshly fetched rows.
    const spec: ChartSpec = {
      type: chart.type,
      title: chart.title,
      x: chart.x,
      series: chart.series,
      data: state.data,
    }
    return (
      <ChartView
        spec={spec}
        sourceSql={chart.sql}
        onEditSource={onEditSource}
        actions={headerActions}
      />
    )
  }

  return (
    <Placeholder
      title={chart.title}
      actions={
        <>
          {/* No chart footer to expand in these states, so keep an edit
              path here — a failing query is exactly what needs editing. */}
          {onEditSource ? (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit source query"
              onClick={onEditSource}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <PencilIcon />
            </Button>
          ) : null}
          {headerActions}
        </>
      }
    >
      {!state || state.kind === "loading" ? (
        <>
          <Loader2Icon className="size-4 animate-spin" /> Running query…
        </>
      ) : state.kind === "not_connected" ? (
        <>
          <UnplugIcon className="size-4" /> Connection not connected — connect it in Connections.
        </>
      ) : state.kind === "no_connection" ? (
        <>
          <DatabaseZapIcon className="size-4" /> This chart's connection no longer exists.
        </>
      ) : (
        <>
          <TriangleAlertIcon className="size-4 shrink-0 text-destructive" />
          <span className="min-w-0 break-words text-destructive">{state.message}</span>
        </>
      )}
    </Placeholder>
  )
}

/** Mirrors ChartView's card frame so mixed grids of charts and states align. */
function Placeholder({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <figure className="group rounded-md border border-border bg-card px-2 py-2">
      <div className="mb-1 flex items-center gap-2 px-1">
        <figcaption className="min-w-0 truncate text-xs font-medium text-foreground">
          {title}
        </figcaption>
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center">{actions}</div>
        ) : null}
      </div>
      <div className="flex h-48 w-full items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
        {children}
      </div>
    </figure>
  )
}
