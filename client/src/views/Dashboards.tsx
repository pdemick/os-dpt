import { useCallback, useEffect, useState } from "react"
import {
  LayoutDashboardIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import type { Dashboard, DashboardMeta } from "@shared/dashboards"

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
import { useDashboardData, type ChartDataState } from "@/lib/dashboards/use-dashboard-data"
import { useConnections } from "@/lib/worksheets/connections"
import { cn } from "@/lib/utils"

const SELECTED_KEY = "os-dpt:dashboard"

export function Dashboards() {
  const [metas, setMetas] = useState<DashboardMeta[] | null>(null)
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem(SELECTED_KEY),
  )
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const { connections } = useConnections()

  const select = useCallback((slug: string | null) => {
    setSelected(slug)
    if (slug) localStorage.setItem(SELECTED_KEY, slug)
    else localStorage.removeItem(SELECTED_KEY)
  }, [])

  const refreshList = useCallback(async (): Promise<DashboardMeta[]> => {
    const list = await dashboardsApi.listDashboards().catch(() => [])
    setMetas(list)
    return list
  }, [])

  useEffect(() => {
    void refreshList().then((list) => {
      setSelected((cur) => (cur && list.some((d) => d.slug === cur) ? cur : (list[0]?.slug ?? null)))
    })
  }, [refreshList])

  // Load the selected dashboard's definition.
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
  }, [selected])

  const create = async () => {
    try {
      const created = await dashboardsApi.createDashboard()
      await refreshList()
      select(created.slug)
    } catch (err) {
      toast.error("Couldn't create dashboard", { description: (err as Error).message })
    }
  }

  const rename = async (slug: string, name: string) => {
    try {
      const updated = await dashboardsApi.renameDashboard(slug, name)
      await refreshList()
      setDashboard((cur) => (cur?.slug === slug ? updated : cur))
    } catch (err) {
      toast.error("Couldn't rename dashboard", { description: (err as Error).message })
    }
  }

  const remove = async (slug: string) => {
    const meta = metas?.find((d) => d.slug === slug)
    if (!window.confirm(`Delete dashboard “${meta?.name ?? slug}”?`)) return
    try {
      await dashboardsApi.deleteDashboard(slug)
      const list = await refreshList()
      if (selected === slug) select(list[0]?.slug ?? null)
    } catch (err) {
      toast.error("Couldn't delete dashboard", { description: (err as Error).message })
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <DashboardListRail
        metas={metas}
        selected={selected}
        onSelect={select}
        onCreate={() => void create()}
        onRename={(slug, name) => void rename(slug, name)}
        onDelete={(slug) => void remove(slug)}
      />
      {dashboard ? (
        <DashboardDetail
          dashboard={dashboard}
          connectionIds={new Set(connections.map((c) => c.id))}
          onDashboardChange={(d) => {
            setDashboard(d)
            void refreshList()
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {metas !== null && metas.length === 0
            ? "No dashboards yet — render a chart in Chat and save it to a dashboard."
            : "Select a dashboard."}
        </div>
      )}
    </div>
  )
}

function DashboardListRail({
  metas,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  metas: DashboardMeta[] | null
  selected: string | null
  onSelect: (slug: string) => void
  onCreate: () => void
  onRename: (slug: string, name: string) => void
  onDelete: (slug: string) => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")

  const commitRename = () => {
    if (renaming && draftName.trim()) onRename(renaming, draftName.trim())
    setRenaming(null)
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium text-sidebar-foreground/70">Dashboards</span>
        <Button variant="ghost" size="icon-xs" title="New dashboard" onClick={onCreate}>
          <PlusIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {metas?.map((d) =>
            renaming === d.slug ? (
              <Input
                key={d.slug}
                autoFocus
                value={draftName}
                className="my-0.5 h-8"
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename()
                  if (e.key === "Escape") setRenaming(null)
                }}
              />
            ) : (
              <div
                key={d.slug}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60",
                  d.slug === selected && "bg-muted/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(d.slug)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <LayoutDashboardIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {d.chartCount} {d.chartCount === 1 ? "chart" : "charts"}
                    </span>
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setDraftName(d.name)
                        setRenaming(d.slug)
                      }}
                    >
                      <PencilIcon /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(d.slug)}>
                      <Trash2Icon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ),
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}

function DashboardDetail({
  dashboard,
  connectionIds,
  onDashboardChange,
}: {
  dashboard: Dashboard
  /** Ids of connections that still exist, to flag charts pointing at deleted ones. */
  connectionIds: Set<string>
  onDashboardChange: (dashboard: Dashboard) => void
}) {
  const { states, refreshAll, refreshOne, anyLoading } = useDashboardData(dashboard)
  const [editing, setEditing] = useState<string | null>(null)

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
          <div className="truncate text-sm font-medium">{dashboard.name}</div>
          <div className="text-xs text-muted-foreground">
            {charts.length} {charts.length === 1 ? "chart" : "charts"}
          </div>
        </div>
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
