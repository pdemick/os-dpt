import pg from "pg"

import type { StoredConnection } from "../storage/connections.ts"

function clientConfig(conn: StoredConnection, password: string) {
  return {
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : false,
  }
}

export async function testConnection(
  conn: StoredConnection,
  password: string,
): Promise<void> {
  const client = new pg.Client({
    ...clientConfig(conn, password),
    connectionTimeoutMillis: 5_000,
  })
  try {
    await client.connect()
    await client.query("SELECT 1")
  } catch (err) {
    throw normalizePgError(err)
  } finally {
    await client.end().catch(() => {})
  }
}

export function normalizePgError(err: unknown): Error {
  if (err instanceof AggregateError) {
    const messages = err.errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .filter(Boolean)
    return new Error(messages.join("; ") || "Connection failed")
  }
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code
    if (!err.message && code) return new Error(code)
    return err
  }
  return new Error(String(err))
}

export function createPool(conn: StoredConnection, password: string): pg.Pool {
  return new pg.Pool(clientConfig(conn, password))
}
