import { useCallback, useEffect, useState } from "react"

import type { Connection } from "@shared/connections"

async function fetchConnections(): Promise<Connection[]> {
  const res = await fetch("/api/connections")
  if (!res.ok) return []
  const body = (await res.json().catch(() => ({}))) as { connections?: Connection[] }
  return Array.isArray(body.connections) ? body.connections : []
}

export interface UseConnectionsResult {
  connections: Connection[]
  active: Connection[]
  refresh: () => Promise<void>
}

// Lightweight client-side store of the connections list. There's no server
// push, so we refresh on mount and on window focus — enough for the editor
// to react when the user adds or connects from the Connections view.
export function useConnections(): UseConnectionsResult {
  const [connections, setConnections] = useState<Connection[]>([])

  const refresh = useCallback(async () => {
    setConnections(await fetchConnections())
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])

  const active = connections.filter((c) => c.active)
  return { connections, active, refresh }
}
