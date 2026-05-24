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
    // For read-only connections, set the GUC in the startup packet so every
    // session this pool opens is read-only from its first statement. Postgres
    // then rejects any write (INSERT/UPDATE/DELETE/DDL) with SQLSTATE 25006 —
    // enforcement lives in the database, not in fragile client-side SQL parsing.
    ...(conn.accessMode === "read-only"
      ? { options: "-c default_transaction_read_only=on" }
      : {}),
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
  const pool = new pg.Pool({
    ...clientConfig(conn, password),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    max: 5,
  })
  // pg emits 'error' on idle clients that drop server-side. Without a listener
  // Node treats it as uncaught; the pool itself recovers on the next acquire.
  pool.on("error", (err) => {
    console.warn(`[pg pool ${conn.name}] idle client error:`, err.message)
  })
  return pool
}

// Server-sent SQLSTATEs that mean the statement was rejected before execution,
// so it is always safe to retry — even mutating SQL.
//   57P01 admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now
const PRE_EXECUTION_CODES = new Set(["57P01", "57P02", "57P03"])

// Socket-level signals that the connection dropped. The server may or may not
// have processed the statement, so these are only safe to retry for idempotent
// (read-only) work.
const SOCKET_DROP_CODES = new Set(["ECONNRESET"])
const SOCKET_DROP_MESSAGE_PATTERNS = [
  "Connection terminated",
  "Client has encountered a connection error",
  "connection terminated unexpectedly",
]

function hasCode(err: unknown, codes: Set<string>): boolean {
  if (!err || typeof err !== "object") return false
  const code = (err as { code?: string }).code
  return typeof code === "string" && codes.has(code)
}

function hasMessage(err: unknown, patterns: string[]): boolean {
  if (!err || typeof err !== "object") return false
  const msg = (err as { message?: string }).message ?? ""
  return patterns.some((p) => msg.includes(p))
}

function isPreExecutionStaleError(err: unknown): boolean {
  return hasCode(err, PRE_EXECUTION_CODES)
}

function isSocketDropError(err: unknown): boolean {
  return hasCode(err, SOCKET_DROP_CODES) || hasMessage(err, SOCKET_DROP_MESSAGE_PATTERNS)
}

export type RetryMode = "pre-execution" | "idempotent"

// Transparently retry a single failure on a stale pg connection.
//   mode "pre-execution" (default): only retry server-confirmed pre-execution
//     errors (57P0x). Safe for any statement, including INSERT/UPDATE/DDL.
//   mode "idempotent": also retry socket-drop errors (ECONNRESET, "Connection
//     terminated"). Only pass this for read-only work, since a socket drop can
//     happen after the server has begun executing the statement.
export async function runWithRetry<T>(
  pool: pg.Pool,
  fn: (pool: pg.Pool) => Promise<T>,
  mode: RetryMode = "pre-execution",
): Promise<T> {
  try {
    return await fn(pool)
  } catch (err) {
    const retry =
      isPreExecutionStaleError(err) || (mode === "idempotent" && isSocketDropError(err))
    if (!retry) throw err
    // The pool drops the dead client itself; a second call will dial a fresh one.
    return await fn(pool)
  }
}
