import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpenIcon,
  ChevronsUpDown,
  DatabaseIcon,
  CheckIcon,
  FileTextIcon,
  PencilIcon,
  EyeIcon,
} from "lucide-react"
import { Streamdown } from "streamdown"

import type { ContextDocMeta } from "@shared/context"
import type { Connection } from "@shared/connections"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MarkdownEditor } from "@/components/docs/MarkdownEditor"
import { useConnections } from "@/lib/worksheets/connections"
import { contextApi } from "@/lib/context/api"
import { cn } from "@/lib/utils"

// Mirrors the markdown prose styling used in the agent transcript so rendered
// docs read consistently across the app.
const PROSE =
  "text-sm leading-relaxed " +
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-0.5 " +
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold " +
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold " +
  "[&_strong]:font-semibold " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] " +
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-2 [&_pre]:text-xs " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs " +
  "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_hr]:my-3 [&_hr]:border-border"

export function Documentation() {
  const { connections, active, refresh: refreshConnections } = useConnections()

  // Scope: a connection id, or null for the workspace-level "unassigned" set.
  const [scope, setScope] = useState<string | null>(null)
  // Auto-select the first active connection once connections load, until the
  // user makes an explicit choice.
  const pickedRef = useRef(false)
  useEffect(() => {
    if (pickedRef.current) return
    const def = active[0]?.id ?? null
    if (def) setScope(def)
  }, [active])

  const [docs, setDocs] = useState<ContextDocMeta[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = editing && draft !== content

  const scopeConn: Connection | null =
    (scope && connections.find((c) => c.id === scope)) || null
  const scopeLabel = scope ? (scopeConn?.name ?? "Unknown source") : "Unassigned"

  const refreshList = useCallback(async (forScope: string | null) => {
    try {
      const list = await contextApi.listDocs(forScope)
      setDocs(list)
      setSelected((cur) => cur ?? list[0]?.name ?? null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  // Reload the doc list whenever the scope changes.
  useEffect(() => {
    void refreshList(scope)
  }, [refreshList, scope])

  // Load the selected doc's content for the current scope.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setError(null)
    contextApi
      .getDoc(selected, scope)
      .then((payload) => {
        if (cancelled) return
        setContent(payload.content)
        setDraft(payload.content)
        setEditing(false)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, scope])

  const confirmDiscard = () => !dirty || window.confirm("Discard unsaved changes?")

  const pickDoc = (name: string) => {
    if (name === selected) return
    if (!confirmDiscard()) return
    setSelected(name)
  }

  const changeScope = (next: string | null) => {
    pickedRef.current = true
    if (next === scope) return
    if (!confirmDiscard()) return
    setScope(next)
  }

  const save = useCallback(async () => {
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    try {
      await contextApi.saveDoc(selected, draft, scope)
      setContent(draft)
      setEditing(false)
      await refreshList(scope)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [selected, draft, scope, saving, refreshList])

  const activeDoc = docs.find((d) => d.name === selected) ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <span className="text-xs font-medium text-muted-foreground">Data source</span>
        <SourcePicker
          connections={connections}
          scope={scope}
          label={scopeLabel}
          onChange={changeScope}
          onOpen={() => void refreshConnections()}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <DocList docs={docs} selected={selected} onPick={pickDoc} />

        <div className="flex min-w-0 flex-1 flex-col">
          {activeDoc ? (
            <>
              <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{activeDoc.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {scopeLabel} · {activeDoc.name}.md
                    {activeDoc.updatedAt
                      ? ` · updated ${relativeTime(activeDoc.updatedAt)}`
                      : " · not yet written"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {editing ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => {
                          setDraft(content)
                          setEditing(false)
                        }}
                        disabled={saving}
                      >
                        <EyeIcon className="size-3.5" />
                        View
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7"
                        onClick={() => void save()}
                        disabled={saving || !dirty}
                      >
                        {saving ? "Saving…" : "Save"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => setEditing(true)}
                    >
                      <PencilIcon className="size-3.5" />
                      Edit
                    </Button>
                  )}
                </div>
              </header>

              {error && (
                <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="min-h-0 flex-1">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : editing ? (
                  <MarkdownEditor value={draft} onChange={setDraft} onSave={() => void save()} />
                ) : (
                  <ScrollArea className="h-full">
                    <div className="mx-auto w-full max-w-3xl px-6 py-6">
                      {content.trim() ? (
                        <div className={cn(PROSE)}>
                          <Streamdown>{content}</Streamdown>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No <span className="font-medium">{activeDoc.title.toLowerCase()}</span>{" "}
                          notes for <span className="font-medium">{scopeLabel}</span> yet. Click{" "}
                          <span className="font-medium">Edit</span> to add some — the agent reads
                          and updates these as you work with this data source.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {error ?? "Select a document from the list."}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SourcePicker({
  connections,
  scope,
  label,
  onChange,
  onOpen,
}: {
  connections: Connection[]
  scope: string | null
  label: string
  onChange: (next: string | null) => void
  onOpen: () => void
}) {
  return (
    <DropdownMenu
      onOpenChange={(o) => {
        if (o) onOpen()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5">
          {scope ? <DatabaseIcon className="size-3.5" /> : <BookOpenIcon className="size-3.5" />}
          <span className="max-w-48 truncate">{label}</span>
          <ChevronsUpDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="text-xs">Data sources</DropdownMenuLabel>
        {connections.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No connections yet
          </DropdownMenuItem>
        ) : (
          connections.map((conn) => (
            <DropdownMenuItem
              key={conn.id}
              onSelect={() => onChange(conn.id)}
              className="text-xs"
            >
              <DatabaseIcon className="size-3" />
              <span className="flex-1 truncate">
                {conn.name}
                {!conn.active && (
                  <span className="text-muted-foreground"> (disconnected)</span>
                )}
              </span>
              {scope === conn.id && <CheckIcon className="size-3" />}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null)} className="text-xs">
          <BookOpenIcon className="size-3" />
          <span className="flex-1">Unassigned (workspace)</span>
          {scope === null && <CheckIcon className="size-3" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DocList({
  docs,
  selected,
  onPick,
}: {
  docs: ContextDocMeta[]
  selected: string | null
  onPick: (name: string) => void
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium text-sidebar-foreground/70">Documents</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {docs.map((doc) => (
            <button
              key={doc.name}
              type="button"
              onClick={() => onPick(doc.name)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60",
                doc.name === selected && "bg-muted/60",
              )}
            >
              <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{doc.title}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {doc.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = Date.now() - then
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return "just now"
  if (diff < hour) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  return new Date(iso).toLocaleDateString()
}
