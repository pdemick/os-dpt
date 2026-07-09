import { useMemo, useRef, useState } from "react"
import { ChevronRightIcon, CodeIcon, CopyIcon, ImageDownIcon } from "lucide-react"
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
import { toast } from "sonner"

import type { ChartSeries, ChartSpec } from "@shared/agent"

import { Button } from "@/components/ui/button"
import { SqlPreview } from "@/components/editor/SqlPreview"
import { cn } from "@/lib/utils"

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

export function ChartView({
  spec,
  sourceSql,
  sourceQueryName,
}: {
  spec: ChartSpec
  /** SQL of the run_sql call that produced this chart's data, when known. */
  sourceSql?: string
  sourceQueryName?: string
}) {
  const figureRef = useRef<HTMLElement>(null)
  const series = useMemo(() => normalizeSeries(spec.series), [spec.series])

  const copyAsImage = () => {
    const figure = figureRef.current
    if (!figure) return
    // Hand the clipboard a promise so the write stays inside the user
    // gesture even though rasterization is async (Safari requires this).
    const blob = chartToPngBlob(figure, spec.title)
    navigator.clipboard
      .write([new ClipboardItem({ "image/png": blob })])
      .then(() => toast.success("Chart copied as image"))
      .catch((err: unknown) =>
        toast.error("Couldn't copy chart", { description: (err as Error).message }),
      )
  }

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
    <figure ref={figureRef} className="group rounded-md border border-border bg-card px-2 py-2">
      <div className="mb-1 flex items-center gap-2 px-1">
        {spec.title ? (
          <figcaption className="min-w-0 truncate text-xs font-medium text-foreground">
            {spec.title}
          </figcaption>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          title="Copy as image"
          onClick={copyAsImage}
          className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <ImageDownIcon />
        </Button>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec.type, spec.x, series, data)}
        </ResponsiveContainer>
      </div>
      {sourceSql ? <SourceQuery sql={sourceSql} queryName={sourceQueryName} /> : null}
    </figure>
  )
}

/**
 * Collapsed-by-default footer linking a chart back to the SQL that produced
 * its data (the closest preceding run_sql call in the transcript).
 */
function SourceQuery({ sql, queryName }: { sql: string; queryName?: string }) {
  const [expanded, setExpanded] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      toast.success("SQL copied to clipboard")
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  return (
    <div className="mt-1.5 border-t border-border/60 pt-1 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-left"
      >
        <CodeIcon className="size-3 shrink-0" />
        <span>Source query</span>
        {queryName ? (
          <span className="truncate font-medium text-foreground/80">{queryName}</span>
        ) : null}
        <ChevronRightIcon
          className={cn("ml-auto size-3 shrink-0 transition-transform", expanded && "rotate-90")}
        />
      </button>
      {expanded ? (
        <div className="px-1 pb-0.5">
          <SqlPreview value={sql} />
          <div className="mt-1">
            <Button variant="ghost" size="xs" onClick={() => void copy()}>
              <CopyIcon data-icon="inline-start" /> Copy
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Rasterize the chart's SVG to a PNG blob. The SVG references theme CSS
 * variables (chart palette, borders) that don't resolve outside the document,
 * so occurrences of `var(--x)` are replaced with their computed values from
 * the live element before rendering. Drawn at 2x for crispness, on the card
 * background, with the title (an HTML sibling of the SVG) painted on top.
 */
async function chartToPngBlob(figure: HTMLElement, title?: string): Promise<Blob> {
  const svg = figure.querySelector("svg")
  if (!svg) throw new Error("Chart is not rendered yet")

  const styles = getComputedStyle(figure)
  const markup = new XMLSerializer()
    .serializeToString(svg)
    .replace(/var\((--[\w-]+)\)/g, (match, name: string) => {
      const value = styles.getPropertyValue(name).trim()
      return value === "" ? match : value
    })

  const rect = svg.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))

  const image = new Image()
  image.decoding = "sync"
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error("Couldn't rasterize the chart"))
  })
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  await loaded

  const scale = 2
  const pad = 8
  const titleHeight = title ? 20 : 0
  const canvas = document.createElement("canvas")
  canvas.width = (width + pad * 2) * scale
  canvas.height = (height + titleHeight + pad * 2) * scale
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is unavailable")
  ctx.scale(scale, scale)
  ctx.fillStyle = styles.getPropertyValue("--card").trim() || "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (title) {
    ctx.fillStyle = styles.getPropertyValue("--foreground").trim() || "#000000"
    ctx.font = `600 12px ${styles.fontFamily}`
    ctx.textBaseline = "top"
    ctx.fillText(title, pad, pad)
  }
  ctx.drawImage(image, pad, pad + titleHeight, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image"))),
      "image/png",
    )
  })
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
