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
import { formatShortcut, matchesShortcut, type Shortcut } from "@/lib/shortcuts"

type QuickAction = {
  id: string
  label: string
  icon: React.ComponentType
  shortcut: Shortcut
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
    shortcut: { mod: true, shift: true, key: "c" },
    view: "chat",
    intent: "new-chat",
  },
  {
    id: "new-editor",
    label: "New editor",
    icon: FilePlus2Icon,
    shortcut: { mod: true, shift: true, key: "e" },
    view: "worksheets",
    intent: "new-editor",
  },
  {
    id: "connections",
    label: "Connections",
    icon: DatabaseIcon,
    shortcut: { mod: true, shift: true, key: "d" },
    view: "connections",
  },
  {
    id: "new-connection",
    label: "New connection",
    icon: PlusIcon,
    shortcut: { mod: true, shift: true, key: "a" },
    view: "connections",
    intent: "new-connection",
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings2Icon,
    shortcut: { mod: true, key: "," },
    view: "settings",
  },
]

const TOGGLE: Shortcut = { mod: true, key: "k" }

// Global quick-action bar (⌘K). Lives at the app shell so its actions can
// navigate to any view; cross-view creation is dispatched via the intent bus.
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
      if (matchesShortcut(e, TOGGLE)) {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      for (const action of QUICK_ACTIONS) {
        if (matchesShortcut(e, action.shortcut)) {
          e.preventDefault()
          run(action)
          return
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [run])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command loop>
        <CommandInput placeholder="Type a command…" />
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
                <CommandShortcut>
                  {formatShortcut(action.shortcut)}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
