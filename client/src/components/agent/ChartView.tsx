import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { ChartSeries, ChartSpec } from "@shared/agent"

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function color(i: number): string {
  return PALETTE[i % PALETTE.length]
}

/** series items may arrive as bare strings or { key, label } — normalize. */
function normalizeSeries(series: ChartSpec["series"]): Required<ChartSeries>[] {
  return (series ?? []).map((s) => {
    const raw = s as ChartSeries | string
    if (typeof raw === "string") return { key: raw, label: raw }
    return { key: raw.key, label: raw.label ?? raw.key }
  })
}

function num(value: unknown): number {
  if (typeof value === "number") return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    fontSize: 11,
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--popover-foreground)" },
} as const

export function ChartView({ spec }: { spec: ChartSpec }) {
  const series = useMemo(() => normalizeSeries(spec.series), [spec.series])

  // Coerce series values to numbers up front so string-typed pg columns chart
  // correctly; leave the x/category value untouched.
  const data = useMemo(
    () =>
      (spec.data ?? []).map((row) => {
        const next: Record<string, unknown> = { [spec.x]: row[spec.x] }
        for (const s of series) next[s.key] = num(row[s.key])
        return next
      }),
    [spec.data, spec.x, series],
  )

  if (data.length === 0 || series.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-2 py-3 text-center text-xs text-muted-foreground">
        Nothing to chart.
      </div>
    )
  }

  return (
    <figure className="rounded-md border border-border bg-card px-2 py-2">
      {spec.title ? (
        <figcaption className="mb-1 px-1 text-xs font-medium text-foreground">
          {spec.title}
        </figcaption>
      ) : null}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec.type, spec.x, series, data)}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

function renderChart(
  type: ChartSpec["type"],
  x: string,
  series: Required<ChartSeries>[],
  data: Record<string, unknown>[],
) {
  const legend =
    series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : undefined

  switch (type) {
    case "line":
      return (
        <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey={x} {...axisProps} />
          <YAxis {...axisProps} width={36} />
          <Tooltip {...tooltipStyle} />
          {legend}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color(i)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )
    case "area":
      return (
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey={x} {...axisProps} />
          <YAxis {...axisProps} width={36} />
          <Tooltip {...tooltipStyle} />
          {legend}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color(i)}
              fill={color(i)}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      )
    case "pie": {
      const valueKey = series[0].key
      return (
        <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Tooltip {...tooltipStyle} />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={x}
            cx="50%"
            cy="50%"
            outerRadius="80%"
            label={{ fontSize: 10, fill: "var(--foreground)" }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={color(i)} />
            ))}
          </Pie>
        </PieChart>
      )
    }
    case "bar":
    default:
      return (
        <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={x} {...axisProps} />
          <YAxis {...axisProps} width={36} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
          {legend}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      )
  }
}
