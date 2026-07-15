import { useEffect, useState } from "react"
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import type { DashboardMeta, NewDashboardChart } from "@shared/dashboards"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { dashboardsApi } from "@/lib/dashboards/api"
import { cn } from "@/lib/utils"

/** "new" selects the create-a-dashboard row; anything else is a dashboard slug. */
const NEW = "new"

export function SaveChartDialog({
  open,
  onOpenChange,
  chart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chart: NewDashboardChart
}) {
  const [dashboards, setDashboards] = useState<DashboardMeta[] | null>(null)
  const [selected, setSelected] = useState<string>(NEW)
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDashboards(null)
    dashboardsApi
      .listDashboards()
      .then((list) => {
        setDashboards(list)
        setSelected(list[0]?.slug ?? NEW)
      })
      .catch(() => setDashboards([]))
  }, [open])

  const save = async () => {
    setSaving(true)
    try {
      let slug = selected
      let name: string
      if (selected === NEW) {
        const created = await dashboardsApi.createDashboard(newName.trim() || undefined)
        slug = created.slug
        name = created.name
      } else {
        name = dashboards?.find((d) => d.slug === slug)?.name ?? slug
      }
      await dashboardsApi.addChart(slug, chart)
      toast.success(`Saved to “${name}”`)
      onOpenChange(false)
    } catch (err) {
      toast.error("Couldn't save chart", { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save chart to dashboard</DialogTitle>
          <DialogDescription>
            The chart's source query re-runs each time the dashboard is opened or refreshed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {dashboards === null ? (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" /> Loading dashboards…
            </div>
          ) : (
            dashboards.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => setSelected(d.slug)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm",
                  selected === d.slug
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.chartCount} {d.chartCount === 1 ? "chart" : "charts"}
                </span>
                {selected === d.slug ? <CheckIcon className="size-3.5 shrink-0" /> : null}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => setSelected(NEW)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm",
              selected === NEW
                ? "border-primary/50 bg-primary/5"
                : "border-dashed border-border hover:bg-muted/50",
            )}
          >
            <PlusIcon className="size-3.5 shrink-0" />
            <span>New dashboard</span>
            {selected === NEW ? <CheckIcon className="ml-auto size-3.5 shrink-0" /> : null}
          </button>
          {selected === NEW ? (
            <Input
              autoFocus
              value={newName}
              placeholder="Dashboard name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save()
              }}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
