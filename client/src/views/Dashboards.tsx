import { useEffect, useState } from "react"
import {
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import type { Dashboard } from "@shared/dashboards"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChartQueryEditor } from "@/components/dashboards/ChartQueryEditor"
import { DashboardChartCard } from "@/components/dashboards/DashboardChartCard"
import { dashboardsApi } from "@/lib/dashboards/api"
import { useDashboards } from "@/lib/dashboards/store"
import { useDashboardData, type ChartDataState } from "@/lib/dashboards/use-dashboard-data"
import { useConnections } from "@/lib/worksheets/connections"

export function Dashboards() {
  const { metas, selected, refreshList, create, rename, remove } = useDashboards()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const { connections } = useConnections()

  // Rename/delete update the list; re-fetch the open dashboard when its list
  // entry changes so the detail header reflects the new name.
  const selectedUpdatedAt = metas?.find((d) => d.slug === selected)?.updatedAt

  useEffect(() => {
    if (!selected) {
      setDashboard(null)
      return
    }
    let cancelled = false
    dashboardsApi
      .getDashboard(selected)
      .then((d) => {
        if (!cancelled) setDashboard(d)
      })
      .catch(() => {
        if (!cancelled) setDashboard(null)
      })
    return () => {
      cancelled = true
    }
  }, [selected, selectedUpdatedAt])

  return (
    <div className="flex min-h-0 flex-1">
      {dashboard ? (
        <DashboardDetail
          dashboard={dashboard}
          connectionIds={new Set(connections.map((c) => c.id))}
          onDashboardChange={(d) => {
            setDashboard(d)
            void refreshList()
          }}
          onRename={(name) => void rename(dashboard.slug, name)}
          onDelete={() => void remove(dashboard.slug)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
          {metas !== null && metas.length === 0 ? (
            <>
              <span>
                No dashboards yet — render a chart in Chat and save it to a
                dashboard.
              </span>
              <Button variant="outline" size="sm" onClick={() => void create()}>
                <PlusIcon data-icon="inline-start" />
                New dashboard
              </Button>
            </>
          ) : (
            "Select a dashboard."
          )}
        </div>
      )}
    </div>
  )
}

function DashboardDetail({
  dashboard,
  connectionIds,
  onDashboardChange,
  onRename,
  onDelete,
}: {
  dashboard: Dashboard
  /** Ids of connections that still exist, to flag charts pointing at deleted ones. */
  connectionIds: Set<string>
  onDashboardChange: (dashboard: Dashboard) => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const { states, refreshAll, refreshOne, anyLoading } = useDashboardData(dashboard)
  const [editing, setEditing] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState("")

  const commitRename = () => {
    const name = draftName.trim()
    if (name && name !== dashboard.name) onRename(name)
    setRenaming(false)
  }

  const confirmDelete = () => {
    if (window.confirm(`Delete dashboard “${dashboard.name}”?`)) onDelete()
  }

  const removeChart = async (chartId: string) => {
    try {
      onDashboardChange(await dashboardsApi.removeChart(dashboard.slug, chartId))
      toast.success("Chart removed")
    } catch (err) {
      toast.error("Couldn't remove chart", { description: (err as Error).message })
    }
  }

  // A chart whose connection was deleted gets the same 409 as a disconnected
  // one from the query route — distinguish them here via the connections list.
  const stateFor = (chartId: string, connectionId: string | null): ChartDataState | undefined => {
    const state = states[chartId]
    if (
      state?.kind === "not_connected" &&
      connectionId &&
      connectionIds.size > 0 &&
      !connectionIds.has(connectionId)
    ) {
      return { kind: "no_connection" }
    }
    return state
  }

  const charts = [...dashboard.charts].sort((a, b) => a.position - b.position)
  const editingChart = editing ? (charts.find((c) => c.id === editing) ?? null) : null

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <div className="min-w-0">
          {renaming ? (
            <Input
              autoFocus
              value={draftName}
              className="h-7"
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename()
                if (e.key === "Escape") setRenaming(false)
              }}
            />
          ) : (
            <>
              <div className="truncate text-sm font-medium">{dashboard.name}</div>
              <div className="text-xs text-muted-foreground">
                {charts.length} {charts.length === 1 ? "chart" : "charts"}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={anyLoading || charts.length === 0}
            onClick={refreshAll}
          >
            {anyLoading ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-7">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setDraftName(dashboard.name)
                  setRenaming(true)
                }}
              >
                <PencilIcon /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={confirmDelete}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {charts.length === 0 ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            No charts yet — render a chart in Chat and save it here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2">
            {charts.map((chart) => (
              <DashboardChartCard
                key={chart.id}
                chart={chart}
                state={stateFor(chart.id, chart.connectionId)}
                onViewSource={() => setEditing(chart.id)}
                onRefresh={() => refreshOne(chart)}
                onRemove={() => void removeChart(chart.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      {editingChart ? (
        <ChartQueryEditor
          dashboardSlug={dashboard.slug}
          chart={editingChart}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null)
          }}
          onSaved={(updated) => {
            onDashboardChange(updated)
            // Refresh with the chart from the server response — the
            // `dashboard` prop hasn't re-rendered with the new SQL yet.
            const fresh = updated.charts.find((c) => c.id === editingChart.id)
            if (fresh) refreshOne(fresh)
          }}
        />
      ) : null}
    </div>
  )
}
