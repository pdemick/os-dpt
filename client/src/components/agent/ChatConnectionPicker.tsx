import { useState } from "react"
import { CheckIcon, ChevronsUpDown, DatabaseIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

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
 * run_sql targets for the current chat and lets the user switch it. All saved
 * connections are selectable; picking an inactive one dials it on demand
 * (run_sql needs a live pool) and only binds once the pool is up.
 */
export function ChatConnectionPicker() {
  const { connectionId, setConnection } = useAgent()
  const { connections, refresh, connect } = useConnections()
  const [open, setOpen] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  // The bound connection may still exist but no longer be active (the user
  // disconnected it); surface its name either way so the binding is clear.
  const bound: Connection | null =
    (connectionId && connections.find((c) => c.id === connectionId)) || null
  const boundActive = bound?.active ?? false

  const handleSelect = async (conn: Connection) => {
    if (!conn.active) {
      setConnectingId(conn.id)
      const result = await connect(conn.id)
      setConnectingId(null)
      if (!result.ok) {
        // Leave the menu open so the user can retry or pick another; the toast
        // carries the reason.
        toast.error(`Couldn't connect to ${conn.name}`, { description: result.error })
        return
      }
    }
    void setConnection(conn.id)
    setOpen(false)
  }

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
        <DropdownMenuLabel className="text-xs">Connections</DropdownMenuLabel>
        {connections.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No connections
          </DropdownMenuItem>
        ) : (
          connections.map((conn) => {
            const isConnecting = connectingId === conn.id
            return (
              <DropdownMenuItem
                key={conn.id}
                // Keep the menu open so the spinner is visible while dialing;
                // handleSelect closes it once the connection is live.
                onSelect={(e) => {
                  e.preventDefault()
                  void handleSelect(conn)
                }}
                disabled={isConnecting}
                className="text-xs"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    conn.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                  title={conn.active ? "Active" : "Saved"}
                />
                <span className="flex-1 truncate">{conn.name}</span>
                {isConnecting ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  connectionId === conn.id && <CheckIcon className="size-3" />
                )}
              </DropdownMenuItem>
            )
          })
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
