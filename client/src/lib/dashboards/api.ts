import type {
  Dashboard,
  DashboardChartPatch,
  DashboardMeta,
  NewDashboardChart,
} from "@shared/dashboards"

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

const base = "/api/dashboards"

export const dashboardsApi = {
  listDashboards: async (): Promise<DashboardMeta[]> => {
    const data = await jsonOrThrow<{ dashboards: DashboardMeta[] }>(await fetch(base))
    return data.dashboards
  },

  createDashboard: async (name?: string): Promise<Dashboard> =>
    jsonOrThrow(
      await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(name ? { name } : {}),
      }),
    ),

  getDashboard: async (slug: string): Promise<Dashboard> =>
    jsonOrThrow(await fetch(`${base}/${encodeURIComponent(slug)}`)),

  renameDashboard: async (slug: string, name: string): Promise<Dashboard> =>
    jsonOrThrow(
      await fetch(`${base}/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    ),

  deleteDashboard: async (slug: string): Promise<void> => {
    await fetch(`${base}/${encodeURIComponent(slug)}`, { method: "DELETE" })
  },

  addChart: async (slug: string, chart: NewDashboardChart): Promise<Dashboard> =>
    jsonOrThrow(
      await fetch(`${base}/${encodeURIComponent(slug)}/charts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chart),
      }),
    ),

  updateChart: async (
    slug: string,
    chartId: string,
    patch: DashboardChartPatch,
  ): Promise<Dashboard> =>
    jsonOrThrow(
      await fetch(`${base}/${encodeURIComponent(slug)}/charts/${encodeURIComponent(chartId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }),
    ),

  removeChart: async (slug: string, chartId: string): Promise<Dashboard> =>
    jsonOrThrow(
      await fetch(`${base}/${encodeURIComponent(slug)}/charts/${encodeURIComponent(chartId)}`, {
        method: "DELETE",
      }),
    ),
}
