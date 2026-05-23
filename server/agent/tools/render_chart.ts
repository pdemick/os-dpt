import type { ChartSeries, ChartSpec, ChartType } from "@shared/agent.ts"

import type { AgentTool } from "./index.ts"

interface Input {
  type?: string
  title?: string
  x?: string
  series?: unknown
  data?: unknown
}

const CHART_TYPES: ChartType[] = ["bar", "line", "area", "pie"]
const MAX_ROWS = 500
const MAX_SERIES = 8

function parseSeries(raw: unknown): ChartSeries[] | string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return "series must be a non-empty array of { key, label? }"
  }
  if (raw.length > MAX_SERIES) {
    return `too many series (${raw.length}); cap is ${MAX_SERIES}`
  }
  const out: ChartSeries[] = []
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ key: item })
      continue
    }
    if (item && typeof item === "object" && typeof (item as ChartSeries).key === "string") {
      const s = item as ChartSeries
      out.push(s.label ? { key: s.key, label: s.label } : { key: s.key })
      continue
    }
    return "each series must be a string key or an object with a string `key`"
  }
  return out
}

function parseData(raw: unknown): Record<string, unknown>[] | string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return "data must be a non-empty array of row objects"
  }
  if (raw.length > MAX_ROWS) {
    return `too many rows (${raw.length}); cap is ${MAX_ROWS}. Aggregate or LIMIT before charting.`
  }
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return "each data element must be a plain object keyed by column name"
    }
  }
  return raw as Record<string, unknown>[]
}

export const renderChartTool: AgentTool = {
  name: "render_chart",
  description:
    "Render a chart inline in the chat to visualize query results. Supply the data rows directly " +
    "(shaped from your run_sql results) along with the chart spec — the chart is self-contained. " +
    "Use this after run_sql when a visualization communicates the answer better than a table: trends " +
    "over time (line/area), category comparisons (bar), or proportions (pie). Keep data small and " +
    "pre-aggregated (cap " +
    `${MAX_ROWS} rows). Each data row is an object keyed by column name, e.g. ` +
    '`[{ "month": "Jan", "revenue": 120 }, …]`. `x` names the category column; `series` names the ' +
    "numeric column(s) to plot. For pie charts only the first series is used.",
  input_schema: {
    type: "object",
    required: ["type", "x", "series", "data"],
    properties: {
      type: {
        type: "string",
        enum: CHART_TYPES,
        description: "Chart kind: bar, line, area, or pie.",
      },
      title: { type: "string", description: "Optional title shown above the chart." },
      x: {
        type: "string",
        description:
          "Row key for the category axis (x-axis for bar/line/area; slice label for pie).",
      },
      series: {
        type: "array",
        description:
          "Numeric series to plot. Each item is { key, label? } or a bare column-name string.",
        items: {
          type: "object",
          required: ["key"],
          properties: {
            key: { type: "string", description: "Row key holding this series' value." },
            label: { type: "string", description: "Legend/tooltip label (defaults to key)." },
          },
        },
      },
      data: {
        type: "array",
        description: "Row objects to chart, keyed by column name.",
        items: { type: "object" },
      },
    },
  },
  async execute(rawInput) {
    const input = (rawInput ?? {}) as Input

    if (typeof input.type !== "string" || !CHART_TYPES.includes(input.type as ChartType)) {
      return {
        toolResult: `Invalid type: must be one of ${CHART_TYPES.join(", ")}`,
        isError: true,
        uiSummary: "render_chart: bad type",
      }
    }
    if (typeof input.x !== "string" || input.x.trim() === "") {
      return {
        toolResult: "Invalid x: must be a non-empty string naming the category column",
        isError: true,
        uiSummary: "render_chart: bad x",
      }
    }
    const series = parseSeries(input.series)
    if (typeof series === "string") {
      return { toolResult: `Invalid series: ${series}`, isError: true, uiSummary: "render_chart: bad series" }
    }
    const data = parseData(input.data)
    if (typeof data === "string") {
      return { toolResult: `Invalid data: ${data}`, isError: true, uiSummary: "render_chart: bad data" }
    }

    const spec: ChartSpec = {
      type: input.type as ChartType,
      x: input.x,
      series,
      data,
      ...(typeof input.title === "string" && input.title.trim() !== ""
        ? { title: input.title }
        : {}),
    }

    const seriesLabel = series.map((s) => s.label ?? s.key).join(", ")
    return {
      toolResult: `Rendered ${spec.type} chart of ${seriesLabel} by ${spec.x} (${data.length} rows) in the chat.`,
      isError: false,
      uiSummary: `Charted ${seriesLabel} by ${spec.x} (${spec.type})`,
      events: [{ type: "chart_rendered", spec }],
    }
  },
}
