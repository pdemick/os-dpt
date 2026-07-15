import { useCallback, useEffect, useRef, useState } from "react"

import type { Dashboard, DashboardChart } from "@shared/dashboards"

import { api as worksheetsApi } from "@/lib/worksheets/api"

export type ChartDataState =
  | { kind: "loading" }
  | { kind: "ok"; data: Record<string, unknown>[] }
  | { kind: "error"; message: string }
  /** The chart's connection exists but isn't connected right now. */
  | { kind: "not_connected" }
  /** The chart has no connection id (or it points at a deleted connection). */
  | { kind: "no_connection" }

/** Zip the query route's array-mode rows into the object rows charts consume. */
function toObjectRows(columns: { name: string }[], rows: unknown[][]): Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c.name, row[i]])))
}

async function fetchChartData(chart: DashboardChart): Promise<ChartDataState> {
  if (!chart.connectionId) return { kind: "no_connection" }
  const result = await worksheetsApi.runQuery(chart.connectionId, chart.sql)
  if (!result.ok) {
    if (result.error === "not_connected") return { kind: "not_connected" }
    return { kind: "error", message: result.error }
  }
  return { kind: "ok", data: toObjectRows(result.columns, result.rows) }
}

/**
 * Fetched data for each chart on a dashboard, keyed by chart id. Charts load
 * on dashboard open and re-run their stored SQL on refreshAll/refreshOne —
 * dashboard files never persist result rows, so this is the only data source.
 */
export function useDashboardData(dashboard: Dashboard | null) {
  const [states, setStates] = useState<Record<string, ChartDataState>>({})
  // Bumped on every full load so stale in-flight fetches from a previous
  // dashboard (or an earlier refresh) can't clobber newer results.
  const generation = useRef(0)

  const runOne = useCallback(async (chart: DashboardChart, gen: number) => {
    setStates((cur) => ({ ...cur, [chart.id]: { kind: "loading" } }))
    let next: ChartDataState
    try {
      next = await fetchChartData(chart)
    } catch (err) {
      next = { kind: "error", message: (err as Error).message }
    }
    if (generation.current !== gen) return
    setStates((cur) => ({ ...cur, [chart.id]: next }))
  }, [])

  const refreshAll = useCallback(() => {
    if (!dashboard) return
    const gen = ++generation.current
    setStates({})
    for (const chart of dashboard.charts) void runOne(chart, gen)
  }, [dashboard, runOne])

  // Takes the chart object (not an id) so callers holding a fresher chart
  // than this hook's `dashboard` prop — e.g. right after a SQL save — refresh
  // with the updated definition instead of a stale closure.
  const refreshOne = useCallback(
    (chart: DashboardChart) => {
      void runOne(chart, generation.current)
    },
    [runOne],
  )

  // Load on dashboard open / switch. Charts added later (rare — saving happens
  // from the Chat view) get fetched by the callers via refreshOne.
  const slug = dashboard?.slug
  useEffect(() => {
    refreshAll()
    // Refetch only when the dashboard identity changes, not on every object
    // identity change from chart edits — those refresh their own chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const anyLoading = Object.values(states).some((s) => s.kind === "loading")

  return { states, refreshAll, refreshOne, anyLoading }
}
