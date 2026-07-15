import {
  ChevronsUpDown,
  DatabaseIcon,
  CheckIcon,
  Loader2Icon,
} from "lucide-react"
import { useEffect, useState } from "react"
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
import { useWorksheets } from "@/hooks/use-worksheets"
import { useConnections } from "@/lib/worksheets/connections"
import { cn } from "@/lib/utils"

interface Props {
  /** Highlight the trigger when the user tries to execute without a connection. */
  pulse?: boolean
}

export function ConnectionPicker({ pulse = false }: Props) {
  const { session, setTabConnection } = useWorksheets()
  const { active, connections, refresh, connect } = useConnections()
  const [open, setOpen] = useState(false)
  const [connectingId, setConnectingId] = useState<string | null>(null)

  const slug = session.activeSlug
  const tab = slug ? session.openTabs.find((t) => t.slug === slug) : null
  const connectionId = tab?.connectionId ?? null
  const connectionExplicit = tab?.connectionExplicit ?? false
  // The bound connection may exist in the workspace but no longer be active
  // (user disconnected); still surface its name so the user knows what's wired.
  const bound: Connection | null =
    (connectionId && connections.find((c) => c.id === connectionId)) || null
  const boundActive = bound?.active ?? false

  const handleSelect = async (conn: Connection) => {
    if (!slug) return
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
    setTabConnection(slug, conn.id)
    setOpen(false)
  }

  // If a tab has no connection and there's exactly one active connection,
  // pre-select it. Suppressed once the user has explicitly picked or cleared
  // a connection on this tab — that decision persists in session.json.
  useEffect(() => {
    if (!slug) return
    if (connectionId !== null) return
    if (connectionExplicit) return
    if (active.length !== 1) return
    setTabConnection(slug, active[0].id, { explicit: false })
  }, [slug, connectionId, connectionExplicit, active, setTabConnection])

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
