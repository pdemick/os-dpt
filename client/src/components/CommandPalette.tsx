import { useCallback, useEffect, useState } from "react"
import {
  DatabaseIcon,
  FilePlus2Icon,
  MessageSquarePlusIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"

import type { View } from "@/components/app-sidebar"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { emitAppIntent } from "@/lib/app-intents"
import { matchesShortcut, type Shortcut } from "@/lib/shortcuts"

type QuickAction = {
  id: string
  label: string
  icon: React.ComponentType
  /**
   * Leader-chord key pressed *after* ⌘K opens the bar (single char, matched
   * case-insensitively). Bare keys never collide with browser/OS shortcuts,
   * so the chord namespace stays entirely ours.
   */
  chord: string
  /** View to navigate to. */
  view: View
  /** Intent fired after navigating, if the action also creates something. */
  intent?: "new-editor" | "new-chat" | "new-connection"
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-chat",
    label: "New chat",
    icon: MessageSquarePlusIcon,
    chord: "c",
    view: "chat",
    intent: "new-chat",
  },
  {
    id: "new-editor",
    label: "New editor",
    icon: FilePlus2Icon,
    chord: "e",
    view: "worksheets",
    intent: "new-editor",
  },
  {
    id: "connections",
    label: "Connections",
    icon: DatabaseIcon,
    chord: "d",
    view: "connections",
  },
  {
    id: "new-connection",
    label: "New connection",
    icon: PlusIcon,
    chord: "a",
    view: "connections",
    intent: "new-connection",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2Icon,
    chord: ",",
    view: "settings",
  },
]

const TOGGLE: Shortcut = { mod: true, key: "k" }

// A chord row's key hint: "C", "E", "," — the bare key to press after ⌘K.
function chordLabel(chord: string): string {
  return chord === "," ? "," : chord.toUpperCase()
}

// Global quick-action bar. ⌘K opens it; a single key then runs an action
// (⌘K then C → new chat). Using a leader chord instead of direct ⌘⇧-combos
// keeps us clear of browser/OS shortcuts that would otherwise win first.
// Lives at the app shell so its actions can navigate to any view; cross-view
// creation is dispatched via the intent bus.
export function CommandPalette({
  onNavigate,
}: {
  onNavigate: (view: View) => void
}) {
  const [open, setOpen] = useState(false)

  const run = useCallback(
    (action: QuickAction) => {
      setOpen(false)
      onNavigate(action.view)
      if (action.intent) emitAppIntent(action.intent)
    },
    [onNavigate]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K (Ctrl+K) toggles the bar from anywhere.
      if (matchesShortcut(e, TOGGLE)) {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      // While the bar is open, a bare chord key runs its action. Capture phase
      // + preventDefault keeps the key out of the command input, so the bar is
      // a pure chord menu rather than a text filter.
      if (!open) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const action = QUICK_ACTIONS.find((a) => a.chord === e.key.toLowerCase())
      if (action) {
        e.preventDefault()
        run(action)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, run])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} loop>
        <CommandInput placeholder="Press a key, or use ↑ ↓ and ⏎…" />
        <CommandList>
          <CommandEmpty>No matching action.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {QUICK_ACTIONS.map((action) => (
              <CommandItem
                key={action.id}
                value={action.label}
                onSelect={() => run(action)}
              >
                <action.icon />
                <span className="flex-1">{action.label}</span>
                <CommandShortcut>{chordLabel(action.chord)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
