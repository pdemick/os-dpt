import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Camera,
  ExternalLink,
  GitCommit,
  Pencil,
  RotateCcw,
  Save,
  Undo2,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type {
  GitCommitItem,
  HistoryEntry,
  HistorySource,
  TimelineItem,
} from "@shared/types"
import { historyApi } from "@/lib/worksheets/history"
import { DiffView } from "./DiffView"

interface Props {
  slug: string
  /** Current editor buffer; diff renders past vs this. */
  currentContent: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful revert; the parent should refresh the buffer. */
  onReverted: (content: string) => void
}

type Selection =
  | { kind: "history"; entry: HistoryEntry }
  | { kind: "git"; item: GitCommitItem }

export function HistoryPanel({ slug, currentContent, open, onOpenChange, onReverted }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pastContent, setPastContent] = useState<string | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentShas, setCurrentShas] = useState<{ sha256: string; gitBlob: string } | null>(
    null,
  )

  // Hash the editor buffer so we can hide timeline rows whose content is
  // identical to it (those would diff as just "N unchanged lines"). Clear
  // the prior hashes while the new ones are being computed so we don't
  // filter fresh buffer content against stale hashes during the async window.
  useEffect(() => {
    let cancelled = false
    setCurrentShas(null)
    void Promise.all([sha256OfText(currentContent), gitBlobSha1OfText(currentContent)]).then(
      ([sha256, gitBlob]) => {
        if (!cancelled) setCurrentShas({ sha256, gitBlob })
      },
    )
    return () => {
      cancelled = true
    }
  }, [currentContent])

  const visibleItems = useMemo(() => {
    if (!currentShas) return items
    return items.filter((item) => {
      if (item.kind === "history") return item.entry.contentSha !== currentShas.sha256
      return item.contentSha !== currentShas.gitBlob
    })
  }, [items, currentShas])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await historyApi.timeline(slug)
      setItems(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [slug])

  // Reset on slug/open changes
  useEffect(() => {
    if (!open) return
    setSelection(null)
    setPastContent(null)
    void refresh()
  }, [open, slug, refresh])

  // Default selection tracks the most recent visible item. Re-runs when the
  // editor buffer changes (e.g. after a revert) so a now-hidden selection
  // advances to the next visible row.
  useEffect(() => {
    if (loading || !currentShas) return
    if (selection) {
      const selSha =
        selection.kind === "history" ? selection.entry.contentSha : selection.item.contentSha
      const cmp = selection.kind === "history" ? currentShas.sha256 : currentShas.gitBlob
      if (selSha !== cmp) return
    }
    const first = visibleItems[0]
    if (!first) {
      if (selection) setSelection(null)
      return
    }
    setSelection(
      first.kind === "history"
        ? { kind: "history", entry: first.entry }
        : { kind: "git", item: first },
    )
  }, [visibleItems, currentShas, selection, loading])

  // Fetch content for the current selection
  useEffect(() => {
    if (!selection) {
      setPastContent(null)
      return
    }
    let cancelled = false
    setContentLoading(true)
    ;(async () => {
      try {
        if (selection.kind === "history") {
          const entry = await historyApi.getEntry(slug, selection.entry.id)
          if (!cancelled) setPastContent(entry.content)
        } else {
          const content = await historyApi.getGitFile(slug, selection.item.sha)
          if (!cancelled) setPastContent(content)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setContentLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selection, slug])

  const grouped = useMemo(() => groupByDay(visibleItems), [visibleItems])

  const handleRevert = useCallback(async () => {
    if (!selection || selection.kind !== "history") return
    setReverting(true)
    setError(null)
    try {
      const { content } = await historyApi.revert(slug, selection.entry.id)
      onReverted(content)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReverting(false)
    }
  }, [selection, slug, onReverted, refresh])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[95vw] max-w-[1400px]! flex-col p-0 sm:max-w-[1400px]!"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-sm">History · {slug}</SheetTitle>
          <SheetDescription className="sr-only">
            Browse and revert prior versions of this worksheet.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1">
          {/* Timeline list */}
          <ScrollArea className="w-80 shrink-0 border-r">
            <div className="p-2">
              {loading && (
                <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
              )}
              {!loading && visibleItems.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  {items.length === 0
                    ? "No history yet. Edits will appear here as you save."
                    : "No prior versions differ from the current buffer."}
                </div>
              )}
              {grouped.map((group) => (
                <div key={group.key} className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <TimelineRow
                      key={item.kind === "history" ? `h-${item.entry.id}` : `g-${item.sha}`}
                      item={item}
                      selected={isSelected(selection, item)}
                      onSelect={() =>
                        setSelection(
                          item.kind === "history"
                            ? { kind: "history", entry: item.entry }
                            : { kind: "git", item },
                        )
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Diff pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs">
              <div className="truncate text-muted-foreground">
                {selection ? <SelectionSummary selection={selection} /> : "Select a version"}
              </div>
              {selection?.kind === "history" && (
                <Button size="sm" onClick={handleRevert} disabled={reverting}>
                  <Undo2 className="size-3.5" />
                  {reverting ? "Restoring…" : "Restore this version"}
                </Button>
              )}
            </div>
            {error && (
              <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <div className="min-h-0 flex-1">
              {selection && pastContent !== null && !contentLoading && (
                <DiffView past={pastContent} current={currentContent} />
              )}
              {(contentLoading || (selection && pastContent === null)) && (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Loading content…
                </div>
              )}
              {!selection && !loading && (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Pick a version from the timeline.
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function isSelected(sel: Selection | null, item: TimelineItem): boolean {
  if (!sel) return false
  if (sel.kind === "history" && item.kind === "history") return sel.entry.id === item.entry.id
  if (sel.kind === "git" && item.kind === "git") return sel.item.sha === item.sha
  return false
}

interface RowProps {
  item: TimelineItem
  selected: boolean
  onSelect: () => void
}

function TimelineRow({ item, selected, onSelect }: RowProps) {
  if (item.kind === "history") return <HistoryRow entry={item.entry} selected={selected} onSelect={onSelect} />
  return <GitRow item={item} selected={selected} onSelect={onSelect} />
}

function HistoryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: HistoryEntry
  selected: boolean
  onSelect: () => void
}) {
  const Icon = sourceIcon(entry.source)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{sourceLabel(entry.source)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(entry.ts)}</span>
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          {entry.label ?? entry.preview ?? "(empty)"}
        </div>
      </div>
    </button>
  )
}

function GitRow({
  item,
  selected,
  onSelect,
}: {
  item: GitCommitItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <GitCommit className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">git · {item.sha.slice(0, 7)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(item.ts)}</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{item.subject || "(no message)"}</div>
      </div>
    </button>
  )
}

function SelectionSummary({ selection }: { selection: Selection }) {
  if (selection.kind === "git") {
    return (
      <span>
        git commit <span className="font-mono">{selection.item.sha.slice(0, 7)}</span> ·{" "}
        {selection.item.subject || "(no message)"}
      </span>
    )
  }
  const { entry } = selection
  return (
    <span>
      {sourceLabel(entry.source)} · {fullTime(entry.ts)}
      {entry.label ? ` · ${entry.label}` : ""}
    </span>
  )
}

function sourceIcon(source: HistorySource) {
  switch (source) {
    case "autosave":
      return Pencil
    case "save":
      return Save
    case "revert":
      return RotateCcw
    case "external":
      return ExternalLink
    case "snapshot":
      return Camera
  }
}

function sourceLabel(source: HistorySource): string {
  switch (source) {
    case "autosave":
      return "Autosave"
    case "save":
      return "Saved"
    case "revert":
      return "Reverted"
    case "external":
      return "External edit"
    case "snapshot":
      return "Initial snapshot"
  }
}

interface DayGroup {
  key: string
  label: string
  items: TimelineItem[]
}

function groupByDay(items: TimelineItem[]): DayGroup[] {
  const groups: DayGroup[] = []
  const byKey = new Map<string, DayGroup>()
  for (const item of items) {
    const ts = item.kind === "history" ? item.entry.ts : item.ts
    const d = new Date(ts)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: dayLabel(d), items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

function dayLabel(d: Date): string {
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (isSameDay(d, today)) return "Today"
  if (isSameDay(d, yest)) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

async function hashHex(algo: "SHA-256" | "SHA-1", bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest(algo, bytes)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
}

async function sha256OfText(text: string): Promise<string> {
  return hashHex("SHA-256", new TextEncoder().encode(text))
}

// Git stores files as `blob <byteLength>\0<bytes>` hashed with SHA-1; we
// recompute that hash here so we can compare against the per-commit blob sha
// the server extracts from `git log --raw`.
async function gitBlobSha1OfText(text: string): Promise<string> {
  const content = new TextEncoder().encode(text)
  const header = new TextEncoder().encode(`blob ${content.length}\0`)
  const combined = new Uint8Array(header.length + content.length)
  combined.set(header, 0)
  combined.set(content, header.length)
  return hashHex("SHA-1", combined)
}

function fullTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}
