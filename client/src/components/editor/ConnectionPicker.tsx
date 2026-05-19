import { ChevronsUpDown, DatabaseIcon, CheckIcon } from "lucide-react"
import { useState } from "react"

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
import { useWorksheets } from "@/hooks/use-worksheets"
import { useConnections } from "@/lib/worksheets/connections"
import { cn } from "@/lib/utils"

interface Props {
  /** Highlight the trigger when the user tries to execute without a connection. */
  pulse?: boolean
}

export function ConnectionPicker({ pulse = false }: Props) {
  const { session, setTabConnection } = useWorksheets()
  const { active, connections, refresh } = useConnections()
  const [open, setOpen] = useState(false)

  const slug = session.activeSlug
  const tab = slug ? session.openTabs.find((t) => t.slug === slug) : null
  const connectionId = tab?.connectionId ?? null
  // The bound connection may exist in the workspace but no longer be active
  // (user disconnected); still surface its name so the user knows what's wired.
  const bound: Connection | null =
    (connectionId && connections.find((c) => c.id === connectionId)) || null
  const boundActive = bound?.active ?? false

  if (!slug) return null

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) void refresh()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-5 gap-1.5 px-1.5 text-[11px] font-mono text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            pulse && "ring-1 ring-orange-500/70 ring-offset-0",
          )}
        >
          <DatabaseIcon className="size-3" />
          {bound ? (
            <span className={cn(!boundActive && "text-sidebar-foreground/50 italic")}>
              {bound.name}
              {!boundActive && " (disconnected)"}
            </span>
          ) : (
            <span>no connection</span>
          )}
          <ChevronsUpDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="text-xs">Active connections</DropdownMenuLabel>
        {active.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No active connections
          </DropdownMenuItem>
        ) : (
          active.map((conn) => (
            <DropdownMenuItem
              key={conn.id}
              onSelect={() => setTabConnection(slug, conn.id)}
              className="text-xs"
            >
              <DatabaseIcon className="size-3" />
              <span className="flex-1 truncate">{conn.name}</span>
              {connectionId === conn.id && <CheckIcon className="size-3" />}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setTabConnection(slug, null)}
          disabled={connectionId === null}
          className="text-xs"
        >
          Clear connection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
