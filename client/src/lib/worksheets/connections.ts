import { useCallback, useEffect, useState } from "react"

import type { Connection } from "@shared/connections"

import { api } from "@/lib/api"

async function fetchConnections(): Promise<Connection[]> {
  const res = await fetch("/api/connections")
  if (!res.ok) return []
  const body = (await res.json().catch(() => ({}))) as { connections?: Connection[] }
  return Array.isArray(body.connections) ? body.connections : []
}

export type ConnectResult = { ok: true } | { ok: false; error: string }

export interface UseConnectionsResult {
  connections: Connection[]
  active: Connection[]
  refresh: () => Promise<void>
  /**
   * Activate a saved connection on demand (spin up its pool). Refreshes the
   * list on success so `active` reflects the new state. Returns the failure
   * reason instead of throwing so callers can surface it (e.g. a toast).
   */
  connect: (id: string) => Promise<ConnectResult>
}

// Lightweight client-side store of the connections list. There's no server
// push, so we refresh on mount and on window focus — enough for the editor
// to react when the user adds or connects from the Connections view.
// Turn the server's terse error codes into something a user can act on. Any
// other string (e.g. a normalized Postgres error) is already human-readable
// and passes through unchanged.
function friendlyConnectError(error: string): string {
  if (error === "missing_credentials")
    return "No stored password for this connection. Edit it to add one."
  if (error === "not_found") return "This connection no longer exists."
  return error
}

export function useConnections(): UseConnectionsResult {
  const [connections, setConnections] = useState<Connection[]>([])

  const refresh = useCallback(async () => {
    setConnections(await fetchConnections())
  }, [])

  const connect = useCallback(
    async (id: string): Promise<ConnectResult> => {
      const result = await api.connect(id)
      // Transport/HTTP failure (e.g. 404) — `error` is the server message.
      if (!result.ok) return { ok: false, error: friendlyConnectError(result.error) }
      // 200 but the dial itself failed (bad auth, host unreachable, …).
      if (result.data.ok === false) {
        return {
          ok: false,
          error: friendlyConnectError(result.data.error ?? "Failed to connect"),
        }
      }
      await refresh()
      return { ok: true }
    },
    [refresh],
  )

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])

  const active = connections.filter((c) => c.active)
  return { connections, active, refresh, connect }
}
