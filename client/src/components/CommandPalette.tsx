import { useEffect, useMemo, useState } from "react"
import {
  Columns2,
  Database,
  FileText,
  Sparkles,
  Table,
  Wand2,
} from "lucide-react"

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
import { useAgent } from "@/lib/agent/context"
import { emitInsertAtCursor } from "@/lib/editor-bus"
import { flattenSchema, type SchemaEntry } from "@/lib/schema/flatten"
import { formatSql } from "@/lib/sql/format"
import { api } from "@/lib/worksheets/api"
import { useConnections } from "@/lib/worksheets/connections"

type Mode = "menu" | "agent"

const SCHEMA_RESULT_CAP = 25

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("menu")
  const [query, setQuery] = useState("")

  const { session, files, list, openTab, updateBuffer } = useWorksheets()
  const { open: openAgentPanel, send: sendAgent } = useAgent()
  const { active: activeConns } = useConnections()

  // Cmd/Ctrl+K toggles the palette globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Reset mode + query whenever the palette closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setMode("menu")
      setQuery("")
    }
  }, [open])

  // Debounced worksheet search; empty query falls back to the recent list
  // so the palette is useful even before the user types anything.
  const [worksheetHits, setWorksheetHits] = useState<WorksheetSearchHit[]>([])
  useEffect(() => {
    if (!open || mode !== "menu") return
    const q = query.trim()
    if (q === "") {
      setWorksheetHits(list.slice(0, 8).map((m) => ({ slug: m.slug, name: m.name, snippet: "" })))
      return
    }
    const handle = setTimeout(async () => {
      try {
        setWorksheetHits(await api.searchWorksheets(q))
      } catch {
        setWorksheetHits([])
      }
    }, 120)
    return () => clearTimeout(handle)
  }, [open, mode, query, list])

  // Preload schemas for every active connection on first open of a session
  // so schema-search returns hits with no per-keystroke fetch.
  const [schemasByConn, setSchemasByConn] = useState<Record<string, SchemaEntry[]>>({})
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
        }),
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
    if (mode !== "menu") return []
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
  }, [mode, query, activeConns, schemasByConn])

  const showAgentAction = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === "" || "claude".startsWith(q) || "agent".startsWith(q) || q.includes("ask")
  }, [query])

  const showFormatAction = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === "") return true
    return ["format", "autoformat", "lowercase", "lower", "comma"].some((kw) =>
      kw.includes(q),
    )
  }, [query])

  const close = () => setOpen(false)

  const enterAgentMode = () => {
    setMode("agent")
    setQuery("")
  }

  const submitAgentPrompt = async () => {
    const text = query.trim()
    if (text === "") return
    close()
    await openAgentPanel()
    await sendAgent(text)
  }

  const runAutoformat = () => {
    const slug = session.activeSlug
    if (!slug) return
    const file = files[slug]
    if (!file) return
    try {
      const formatted = formatSql(file.buffer)
      updateBuffer(slug, formatted)
    } catch {
      // Malformed SQL — leave the buffer untouched rather than mangling it.
    }
    close()
  }

  const openWorksheetHit = async (slug: string) => {
    close()
    await openTab(slug)
  }

  const insertSchemaEntry = (entry: SchemaEntry) => {
    close()
    emitInsertAtCursor(entry.qualified)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={
            mode === "agent"
              ? "Describe what you want the agent to do — press Enter to send"
              : "Search worksheets, schema, or type \"agent\" / \"format\"…"
          }
          onKeyDown={(e) => {
            if (mode === "agent" && e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submitAgentPrompt()
            }
            if (mode === "agent" && e.key === "Escape") {
              setMode("menu")
              setQuery("")
            }
          }}
        />
        {mode === "menu" && (
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>

            {(showAgentAction || showFormatAction) && (
              <CommandGroup heading="Actions">
                {showAgentAction && (
                  <CommandItem value="action:agent" onSelect={enterAgentMode}>
                    <Sparkles />
                    <span className="flex-1">Ask agent…</span>
                    <span className="text-xs text-muted-foreground">claude · agent</span>
                  </CommandItem>
                )}
                {showFormatAction && (
                  <CommandItem
                    value="action:autoformat"
                    onSelect={runAutoformat}
                    disabled={!session.activeSlug}
                  >
                    <Wand2 />
                    <span className="flex-1">Autoformat worksheet</span>
                    <span className="text-xs text-muted-foreground">lowercase · leading commas</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}

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
                      <span className="truncate font-mono text-xs">{entry.qualified}</span>
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
        )}
      </Command>
    </CommandDialog>
  )
}
