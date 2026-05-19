import {
  Braces,
  Columns2,
  FunctionSquare,
  Sigma,
  Table,
} from "lucide-react"
import type { JSX } from "react"

import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

import type { MenuEntry, MenuKind } from "./entries"

interface Props {
  /** Already filtered + ordered by the plugin. */
  entries: MenuEntry[]
  /** Index into `entries`; the matching row gets `data-selected`. */
  selectedIndex: number
  onPick: (entry: MenuEntry) => void
  /** Mouse hover updates the selected index in the StateField. */
  onHover: (index: number) => void
}

const VISIBLE_LIMIT = 60

const KIND_ICONS: Record<MenuKind, () => JSX.Element> = {
  table: () => <Table />,
  column: () => <Columns2 />,
  function: () => <FunctionSquare />,
  operator: () => <Sigma />,
  snippet: () => <Braces />,
}

export function SlashMenu({ entries, selectedIndex, onPick, onHover }: Props) {
  const visible = entries.slice(0, VISIBLE_LIMIT)
  const selectedValue =
    selectedIndex < visible.length
      ? entryValue(visible[selectedIndex], selectedIndex)
      : undefined

  return (
    <div className="w-[360px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
      <Command shouldFilter={false} value={selectedValue}>
        <CommandList className="max-h-[320px]">
          {visible.length === 0 ? (
            <CommandEmpty>No matches.</CommandEmpty>
          ) : (
            visible.map((entry, index) => (
              <Row
                key={entryValue(entry, index)}
                entry={entry}
                index={index}
                onPick={onPick}
                onHover={onHover}
              />
            ))
          )}
        </CommandList>
      </Command>
    </div>
  )
}

function Row({
  entry,
  index,
  onPick,
  onHover,
}: {
  entry: MenuEntry
  index: number
  onPick: (entry: MenuEntry) => void
  onHover: (index: number) => void
}) {
  const Icon = KIND_ICONS[entry.kind]
  return (
    <CommandItem
      value={entryValue(entry, index)}
      onSelect={() => onPick(entry)}
      onMouseEnter={() => onHover(index)}
      className="font-mono text-xs"
    >
      <Icon />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.kind === "column" && entry.table ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{entry.table}</span>
      ) : entry.detail ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{entry.detail}</span>
      ) : null}
    </CommandItem>
  )
}

// cmdk's selection is keyed by `value`. Kind + label keeps a function
// "COUNT" distinct from a hypothetical column called "COUNT"; the index
// disambiguates any same-(kind,label) duplicates that might slip in
// (e.g. two snippets both labelled "COALESCE") so cmdk's selection
// state doesn't collapse them into a single row.
function entryValue(entry: MenuEntry, index: number): string {
  return `${entry.kind}:${entry.label}:${index}`
}
