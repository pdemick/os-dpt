import { DatabaseZapIcon, Loader2Icon, TriangleAlertIcon, UnplugIcon } from "lucide-react"

import type { ChartSpec } from "@shared/agent"
import type { DashboardChart } from "@shared/dashboards"

import { ChartView } from "@/components/agent/ChartView"
import type { ChartDataState } from "@/lib/dashboards/use-dashboard-data"

export function DashboardChartCard({
  chart,
  state,
}: {
  chart: DashboardChart
  state: ChartDataState | undefined
}) {
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
    return <ChartView spec={spec} sourceSql={chart.sql} />
  }

  return (
    <Placeholder title={chart.title}>
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
function Placeholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-md border border-border bg-card px-2 py-2">
      <figcaption className="mb-1 truncate px-1 text-xs font-medium text-foreground">
        {title}
      </figcaption>
      <div className="flex h-48 w-full items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
        {children}
      </div>
    </figure>
  )
}
