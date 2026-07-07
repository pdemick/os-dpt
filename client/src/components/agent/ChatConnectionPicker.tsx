import { useState } from "react"
import { CheckIcon, ChevronsUpDown, DatabaseIcon } from "lucide-react"

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
import { useAgent } from "@/lib/agent/context"
import { useConnections } from "@/lib/worksheets/connections"
import { cn } from "@/lib/utils"

/**
 * Connection badge for the chat surfaces. Shows the connection the agent's
 * run_sql targets for the current chat and lets the user switch it. Only
 * active connections are selectable, since run_sql needs a live pool.
 */
export function ChatConnectionPicker() {
  const { connectionId, setConnection } = useAgent()
  const { connections, active, refresh } = useConnections()
  const [open, setOpen] = useState(false)
  // The bound connection may still exist but no longer be active (the user
  // disconnected it); surface its name either way so the binding is clear.
  const bound: Connection | null =
    (connectionId && connections.find((c) => c.id === connectionId)) || null
  const boundActive = bound?.active ?? false

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
          className="h-6 gap-1.5 px-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground"
        >
          <DatabaseIcon className="size-3" />
          {bound ? (
            <span className={cn(!boundActive && "italic text-muted-foreground/60")}>
              {bound.name}
              {!boundActive && " (disconnected)"}
            </span>
          ) : (
            <span>no connection</span>
          )}
          <ChevronsUpDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-xs">Active connections</DropdownMenuLabel>
        {active.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No active connections
          </DropdownMenuItem>
        ) : (
          active.map((conn) => (
            <DropdownMenuItem
              key={conn.id}
              onSelect={() => void setConnection(conn.id)}
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
          onSelect={() => void setConnection(null)}
          disabled={connectionId === null}
          className="text-xs"
        >
          Clear connection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
