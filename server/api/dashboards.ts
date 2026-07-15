import { Hono } from "hono"
import { createHash, randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"

import { CHART_TYPES, type ChartSeries, type ChartType } from "@shared/agent.ts"
import type {
  Dashboard,
  DashboardChart,
  DashboardChartPatch,
  DashboardMeta,
  NewDashboardChart,
} from "@shared/dashboards.ts"

import { assertSafeSlug, paths } from "../workspace.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import { dedupeSlug, slugify } from "../lib/slug.ts"

const app = new Hono()
const MAX_NAME_LEN = 80
const MAX_TITLE_LEN = 120

async function readDashboard(slug: string): Promise<Dashboard | null> {
  try {
    const raw = await fs.readFile(paths.dashboard(slug), "utf8")
    const parsed = JSON.parse(raw) as Dashboard
    return normalize(slug, parsed)
  } catch {
    return null
  }
}

// Backfill missing fields on read so schema evolution never breaks old files
// (same forward-compat posture as chats' ensureUsageFields). dashboards/ is
// git-tracked and hand-editable, so stored charts get the same validation as
// client payloads — entries with no usable type/x/sql/series are dropped
// (and fall out of the file on the next write).
function normalize(slug: string, d: Dashboard): Dashboard {
  return {
    slug,
    name: typeof d.name === "string" && d.name.trim() !== "" ? d.name : slug,
    createdAt: d.createdAt ?? new Date(0).toISOString(),
    updatedAt: d.updatedAt ?? new Date(0).toISOString(),
    charts: (Array.isArray(d.charts) ? d.charts : []).flatMap((chart, i) => {
      const parsed = parseChart(chart)
      if (typeof parsed === "string") return []
      const c = chart as { id?: unknown; position?: unknown }
      return [
        {
          ...parsed,
          id: typeof c.id === "string" && c.id !== "" ? c.id : deriveChartId(slug, i, chart),
          position: typeof c.position === "number" ? c.position : i,
        },
      ]
    }),
  }
}

// Backfilled ids must be stable across reads: the client addresses PUT/DELETE
// with the id it got from a GET, and the mutation handler re-reads the file.
// A random id per read would 404 every mutation on a hand-edited chart, so
// derive it from the stored content instead — the next persist() freezes it
// into the file.
function deriveChartId(slug: string, index: number, chart: unknown): string {
  const hash = createHash("sha256").update(`${slug}\n${index}\n${JSON.stringify(chart)}`).digest("hex")
  return `gen-${hash.slice(0, 12)}`
}

async function persist(dashboard: Dashboard): Promise<Dashboard> {
  dashboard.updatedAt = new Date().toISOString()
  await writeAtomic(paths.dashboard(dashboard.slug), JSON.stringify(dashboard, null, 2))
  return dashboard
}

async function listSlugs(): Promise<string[]> {
  const entries = await fs.readdir(paths.dashboards()).catch(() => [])
  return entries.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
}

// Serialize mutations per dashboard: each one is a read-modify-write over the
// whole file, so two concurrent requests (e.g. from two browser tabs) could
// otherwise interleave and silently drop each other's changes.
const mutationTails = new Map<string, Promise<void>>()

function withDashboardLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutationTails.get(slug) ?? Promise.resolve()
  const result = prev.then(fn)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  mutationTails.set(slug, tail)
  void tail.then(() => {
    if (mutationTails.get(slug) === tail) mutationTails.delete(slug)
  })
  return result
}

/** Validates a client-supplied chart payload. Returns the clean chart or an error string. */
function parseChart(raw: unknown): NewDashboardChart | string {
  if (!raw || typeof raw !== "object") return "chart must be an object"
  const c = raw as Record<string, unknown>
  if (!CHART_TYPES.includes(c.type as ChartType)) {
    return `type must be one of: ${CHART_TYPES.join(", ")}`
  }
  if (typeof c.x !== "string" || c.x.trim() === "") return "x must be a non-empty string"
  if (typeof c.sql !== "string" || c.sql.trim() === "") return "sql must be a non-empty string"
  if (!Array.isArray(c.series) || c.series.length === 0) {
    return "series must be a non-empty array of { key, label? }"
  }
  const series: ChartSeries[] = []
  for (const item of c.series) {
    if (!item || typeof item !== "object" || typeof (item as ChartSeries).key !== "string") {
      return "each series must be an object with a string `key`"
    }
    const s = item as ChartSeries
    series.push(typeof s.label === "string" && s.label !== "" ? { key: s.key, label: s.label } : { key: s.key })
  }
  const title = typeof c.title === "string" && c.title.trim() !== "" ? c.title.trim() : "Untitled chart"
  const connectionId = typeof c.connectionId === "string" && c.connectionId !== "" ? c.connectionId : null
  return {
    title: title.length > MAX_TITLE_LEN ? title.slice(0, MAX_TITLE_LEN) : title,
    type: c.type as ChartType,
    x: c.x,
    series,
    sql: c.sql,
    connectionId,
  }
}

app.get("/", async (c) => {
  const slugs = await listSlugs()
  const metas: DashboardMeta[] = []
  for (const slug of slugs) {
    const d = await readDashboard(slug)
    if (!d) continue // skip malformed/unreadable files
    metas.push({ slug, name: d.name, updatedAt: d.updatedAt, chartCount: d.charts.length })
  }
  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return c.json({ dashboards: metas })
})

app.post("/", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string })
  const raw = (body.name ?? "").trim()
  const name = raw === "" ? "Dashboard" : raw.length > MAX_NAME_LEN ? raw.slice(0, MAX_NAME_LEN) : raw
  const existing = new Set(await listSlugs())
  const slug = dedupeSlug(slugify(name, "dashboard"), existing)
  const now = new Date().toISOString()
  const dashboard: Dashboard = { slug, name, createdAt: now, updatedAt: now, charts: [] }
  await writeAtomic(paths.dashboard(slug), JSON.stringify(dashboard, null, 2))
  return c.json(dashboard, 201)
})

app.get("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const dashboard = await readDashboard(slug)
  if (!dashboard) return c.json({ error: "not_found" }, 404)
  return c.json(dashboard)
})

app.patch("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string })
  const raw = (body.name ?? "").trim()
  if (!raw) return c.json({ error: "empty_name" }, 400)
  return withDashboardLock(slug, async () => {
    const dashboard = await readDashboard(slug)
    if (!dashboard) return c.json({ error: "not_found" }, 404)
    dashboard.name = raw.length > MAX_NAME_LEN ? raw.slice(0, MAX_NAME_LEN) : raw
    return c.json(await persist(dashboard))
  })
})

app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  // Locked so an in-flight mutation can't persist after the rm and
  // resurrect the file.
  return withDashboardLock(slug, async () => {
    await fs.rm(paths.dashboard(slug), { force: true })
    return c.json({ ok: true })
  })
})

app.post("/:slug/charts", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const body = await c.req.json<unknown>().catch(() => null)
  const parsed = parseChart(body)
  if (typeof parsed === "string") return c.json({ error: parsed }, 400)
  return withDashboardLock(slug, async () => {
    const dashboard = await readDashboard(slug)
    if (!dashboard) return c.json({ error: "not_found" }, 404)
    const position = dashboard.charts.reduce((max, ch) => Math.max(max, ch.position), -1) + 1
    const chart: DashboardChart = { ...parsed, id: randomUUID(), position }
    dashboard.charts.push(chart)
    return c.json(await persist(dashboard))
  })
})

app.put("/:slug/charts/:chartId", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  // Chart ids are only ever compared against stored ids (never used in
  // paths), so membership is the validation — hand-edited non-UUID ids
  // stay addressable.
  const chartId = c.req.param("chartId")
  const body = await c.req.json<DashboardChartPatch>().catch(() => ({}) as DashboardChartPatch)
  return withDashboardLock(slug, async () => {
    const dashboard = await readDashboard(slug)
    if (!dashboard) return c.json({ error: "not_found" }, 404)
    const chart = dashboard.charts.find((ch) => ch.id === chartId)
    if (!chart) return c.json({ error: "not_found" }, 404)
    // Validate the patch by merging it over the existing chart and re-parsing,
    // so partial updates get the same checks as creation.
    const parsed = parseChart({ ...chart, ...body })
    if (typeof parsed === "string") return c.json({ error: parsed }, 400)
    Object.assign(chart, parsed)
    return c.json(await persist(dashboard))
  })
})

app.delete("/:slug/charts/:chartId", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const chartId = c.req.param("chartId")
  return withDashboardLock(slug, async () => {
    const dashboard = await readDashboard(slug)
    if (!dashboard) return c.json({ error: "not_found" }, 404)
    const before = dashboard.charts.length
    dashboard.charts = dashboard.charts.filter((ch) => ch.id !== chartId)
    if (dashboard.charts.length === before) return c.json({ error: "not_found" }, 404)
    return c.json(await persist(dashboard))
  })
})

export default app
