import type { Pool } from "pg"

const pools = new Map<string, Pool>()

export function setPool(id: string, pool: Pool): void {
  pools.set(id, pool)
}

export function getPool(id: string): Pool | undefined {
  return pools.get(id)
}

export async function removePool(id: string): Promise<void> {
  const pool = pools.get(id)
  if (!pool) return
  pools.delete(id)
  await pool.end().catch(() => {})
}

export function activeIds(): Set<string> {
  return new Set(pools.keys())
}

export async function closeAll(): Promise<void> {
  const entries = Array.from(pools.values())
  pools.clear()
  await Promise.all(entries.map((pool) => pool.end().catch(() => {})))
}
