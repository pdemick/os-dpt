import { useEffect, useMemo, useState } from "react"
import { Columns2, Database, FileText, Table } from "lucide-react"

import type { Connection } from "@shared/connections"
import type { WorksheetSearchHit } from "@shared/types"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useWorksheets } from "@/hooks/use-worksheets"
import { emitInsertAtCursor } from "@/lib/editor-bus"
import { flattenSchema, type SchemaEntry } from "@/lib/schema/flatten"
import { api } from "@/lib/worksheets/api"
import { useConnections } from "@/lib/worksheets/connections"

const SCHEMA_RESULT_CAP = 25

// Returns true when focus is in a text field or the SQL editor, where "/" is a
// literal character (division, /* comments */) and must not open search.
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (el.isContentEditable) return true
  if (el.closest(".cm-editor")) return true
  return false
}

// "/" search palette: jump to a worksheet or insert a schema reference into the
// active editor. Opens on "/" whenever the user isn't typing in a field.
export function SearchMenu() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const { list, openTab } = useWorksheets()
  const { active: activeConns } = useConnections()

  // Global "/" opens search; ignored while typing so SQL/inputs keep the slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(document.activeElement)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Recent worksheets, shown when the query is empty (derived — no effect).
  const recentHits = useMemo<WorksheetSearchHit[]>(
    () =>
      list
        .slice(0, 8)
        .map((m) => ({ slug: m.slug, name: m.name, snippet: "" })),
    [list]
  )

  // Debounced full-text search; results land in state from the timeout (an
  // async callback, not the effect body, so no synchronous setState).
  const [searchHits, setSearchHits] = useState<WorksheetSearchHit[]>([])
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q === "") return
    const handle = setTimeout(async () => {
      try {
        setSearchHits(await api.searchWorksheets(q))
      } catch {
        setSearchHits([])
      }
    }, 120)
    return () => clearTimeout(handle)
  }, [open, query])

  const worksheetHits = query.trim() === "" ? recentHits : searchHits

  // Preload schemas for every active connection on open so schema search
  // returns hits with no per-keystroke fetch.
  const [schemasByConn, setSchemasByConn] = useState<
    Record<string, SchemaEntry[]>
  >({})
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const results = await Promise.all(
        activeConns.map(async (c) => {
          try {
            const raw = await api.getConnectionSchema(c.id)
            return [c.id, flattenSchema(raw)] as const
          } catch {
            return [c.id, [] as SchemaEntry[]] as const
          }
        })
      )
      if (cancelled) return
      const next: Record<string, SchemaEntry[]> = {}
      for (const [id, entries] of results) next[id] = entries
      setSchemasByConn(next)
    })()
    return () => {
      cancelled = true
    }
  }, [open, activeConns])

  const schemaHits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === "") return []
    const out: { conn: Connection; entry: SchemaEntry }[] = []
    outer: for (const conn of activeConns) {
      const entries = schemasByConn[conn.id] ?? []
      for (const entry of entries) {
        if (
          entry.qualified.toLowerCase().includes(q) ||
          entry.leaf.toLowerCase().includes(q)
        ) {
          out.push({ conn, entry })
          if (out.length >= SCHEMA_RESULT_CAP) break outer
        }
      }
    }
    return out
  }, [query, activeConns, schemasByConn])

  const openWorksheetHit = async (slug: string) => {
    setOpen(false)
    await openTab(slug)
  }

  const insertSchemaEntry = (entry: SchemaEntry) => {
    setOpen(false)
    emitInsertAtCursor(entry.qualified)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery("")
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search worksheets and schema…"
        />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          {worksheetHits.length > 0 && (
            <CommandGroup
              heading={query.trim() === "" ? "Recent worksheets" : "Worksheets"}
            >
              {worksheetHits.map((hit) => (
                <CommandItem
                  key={hit.slug}
                  value={`ws:${hit.slug}`}
                  onSelect={() => void openWorksheetHit(hit.slug)}
                >
                  <FileText />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{hit.name}</span>
                    {hit.snippet && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {hit.lineNumber ? `L${hit.lineNumber}: ` : ""}
                        {hit.snippet}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {schemaHits.length > 0 && (
            <CommandGroup heading="Schema">
              {schemaHits.map(({ conn, entry }) => (
                <CommandItem
                  key={`${conn.id}:${entry.qualified}`}
                  value={`schema:${conn.id}:${entry.qualified}`}
                  onSelect={() => insertSchemaEntry(entry)}
                >
                  {entry.kind === "table" ? <Table /> : <Columns2 />}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-xs">
                      {entry.qualified}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Database className="size-3" />
                      {conn.name}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
