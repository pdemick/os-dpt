import type { ChartSeries, ChartType } from "./agent.ts"

/**
 * One saved chart on a dashboard. Persisted WITHOUT result data —
 * dashboards/ is git-tracked and query results may be sensitive. Data is
 * fetched client-side on dashboard open / refresh via the connection query
 * API, using the stored `sql` + `connectionId`.
 */
export interface DashboardChart {
  /** Server-minted UUID. */
  id: string
  title: string
  type: ChartType
  /** Row key for the category axis (ChartSpec.x). */
  x: string
  series: ChartSeries[]
  /** Source query, re-run on refresh. */
  sql: string
  /** Null when the origin connection is unknown or has been deleted. */
  connectionId: string | null
  /** Ascending sort order on the dashboard grid. */
  position: number
}

export interface Dashboard {
  slug: string
  name: string
  createdAt: string
  updatedAt: string
  charts: DashboardChart[]
}

/** List-item shape (GET /api/dashboards). */
export interface DashboardMeta {
  slug: string
  name: string
  updatedAt: string
  chartCount: number
}

/** Client payload to add a chart; the server assigns id + position. */
export type NewDashboardChart = Omit<DashboardChart, "id" | "position">

/** Editable chart fields (PUT). id/position are immutable via this route. */
export type DashboardChartPatch = Partial<Omit<DashboardChart, "id" | "position">>
