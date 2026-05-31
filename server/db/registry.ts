import type { Pool } from "pg"

import type { AccessMode } from "@shared/connections.ts"

type Entry = { pool: Pool; accessMode: AccessMode }

const pools = new Map<string, Entry>()

// Install a pool, ending any previously-installed pool for the same id so a
// concurrent caller (e.g. boot-time autoConnectAll racing a user-clicked
// Connect) can't leak the loser. The accessMode is recorded alongside the pool
// so callers (run_sql) can enforce read-only without re-reading storage; it is
// fixed at connection startup, so a mode flip re-dials and calls setPool again.
export function setPool(id: string, pool: Pool, accessMode: AccessMode): void {
  const prev = pools.get(id)
  pools.set(id, { pool, accessMode })
  if (prev && prev.pool !== pool) {
    void prev.pool.end().catch(() => {})
  }
}

export function getPool(id: string): Pool | undefined {
  return pools.get(id)?.pool
}

export function getAccessMode(id: string): AccessMode | undefined {
  return pools.get(id)?.accessMode
}

export async function removePool(id: string): Promise<void> {
  const entry = pools.get(id)
  if (!entry) return
  pools.delete(id)
  await entry.pool.end().catch(() => {})
}

export function activeIds(): Set<string> {
  return new Set(pools.keys())
}

export async function closeAll(): Promise<void> {
  const entries = Array.from(pools.values())
  pools.clear()
  await Promise.all(entries.map((entry) => entry.pool.end().catch(() => {})))
}
