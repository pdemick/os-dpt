import crypto from "node:crypto"
import { promises as fs } from "node:fs"

import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import type { Connection, NewConnectionInput } from "@shared/connections.ts"
import type { QueryOk, SQLNamespace } from "@shared/types.ts"

import { CredentialVault } from "../credentials/vault.ts"
import { introspect } from "../db/introspect.ts"
import {
  createPool,
  normalizePgError,
  runWithRetry,
  testConnection,
} from "../db/postgres.ts"
import { activeIds, getPool, removePool, setPool } from "../db/registry.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import { ConnectionStore, type StoredConnection } from "../storage/connections.ts"
import { paths } from "../workspace.ts"

const MAX_ROWS = 1000

// Connection ids are server-minted UUIDs; reject anything that isn't one so
// the value can be safely interpolated into filesystem paths.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertSafeConnectionId(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new HTTPException(400, { message: `Invalid connection id` })
  }
}

async function writeConnectionSchema(id: string, schema: SQLNamespace): Promise<void> {
  await writeAtomic(paths.connectionSchema(id), JSON.stringify(schema, null, 2))
}

function parseInput(body: unknown): NewConnectionInput {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body")
  }
  const b = body as Record<string, unknown>

  const requireStr = (v: unknown, field: string): string => {
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`Missing required field: ${field}`)
    }
    return v.trim()
  }

  const parsePort = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`Invalid port: must be an integer in [1, 65535]`)
    }
    return n
  }

  return {
    name: requireStr(b.name, "name"),
    driver: "postgres",
    host: requireStr(b.host, "host"),
    port: parsePort(b.port ?? 5432),
    database: requireStr(b.database, "database"),
    user: requireStr(b.user, "user"),
    password: typeof b.password === "string" ? b.password : "",
    ssl: Boolean(b.ssl),
    // Secure by default: a new connection is read-only unless the caller
    // explicitly asks for "read-write". The client dialog sends an explicit
    // mode; this default only governs direct API callers that omit it. (Legacy
    // *stored* connections without the field stay read-write — see
    // storage/connections.ts — so upgrading never silently revokes writes.)
    accessMode: b.accessMode === "read-write" ? "read-write" : "read-only",
  }
}

// Editable fields of a stored connection. `driver`/`id`/`createdAt` are
// immutable; the password lives in the vault, not the metadata store.
type ConnectionPatch = Partial<Omit<StoredConnection, "id" | "driver" | "createdAt">>

// Parse a PATCH body into a metadata patch plus an optional password. Only
// validates the fields that are actually present, so both the full edit form
// and a targeted `{ accessMode }` toggle go through the same path. An empty or
// absent password means "keep the stored credential".
function parsePatch(body: unknown): { patch: ConnectionPatch; password?: string } {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body")
  }
  const b = body as Record<string, unknown>
  const patch: ConnectionPatch = {}

  const requireStr = (v: unknown, field: string): string => {
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`Missing required field: ${field}`)
    }
    return v.trim()
  }

  if ("name" in b) patch.name = requireStr(b.name, "name")
  if ("host" in b) patch.host = requireStr(b.host, "host")
  if ("port" in b) {
    const n = typeof b.port === "number" ? b.port : Number(b.port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error("Invalid port: must be an integer in [1, 65535]")
    }
    patch.port = n
  }
  if ("database" in b) patch.database = requireStr(b.database, "database")
  if ("user" in b) patch.user = requireStr(b.user, "user")
  if ("ssl" in b) patch.ssl = Boolean(b.ssl)
  if ("accessMode" in b) {
    if (b.accessMode !== "read-only" && b.accessMode !== "read-write") {
      throw new Error("accessMode must be 'read-only' or 'read-write'")
    }
    patch.accessMode = b.accessMode
  }

  const password =
    typeof b.password === "string" && b.password !== "" ? b.password : undefined
  return { patch, password }
}

function toApi(conn: StoredConnection, active: Set<string>): Connection {
  return { ...conn, active: active.has(conn.id) }
}

// A throwaway connection used only to dial the database in a test probe; never
// persisted, so the id/createdAt are placeholders.
function buildProbe(input: NewConnectionInput): StoredConnection {
  return {
    id: "probe",
    name: input.name,
    driver: "postgres",
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    ssl: input.ssl,
    accessMode: input.accessMode,
    createdAt: new Date().toISOString(),
  }
}

type ConnectResult = { ok: true } | { ok: false; error: string; status: number }

// "replace" — user-initiated: always install this pool, ending any predecessor.
// "claim"   — auto-connect: yield to any pool installed during our dial, so a
//             racing user click can't be silently displaced by our late-arriving
//             pool.
type ConnectMode = "replace" | "claim"

async function connectStored(
  id: string,
  store: ConnectionStore,
  vault: CredentialVault,
  mode: ConnectMode = "replace",
): Promise<ConnectResult> {
  const conn = await store.get(id)
  if (!conn) return { ok: false, error: "not_found", status: 404 }
  const password = await vault.getPassword(id)
  if (password === null) {
    return { ok: false, error: "missing_credentials", status: 400 }
  }
  const pool = createPool(conn, password)
  try {
    const client = await pool.connect()
    try {
      await client.query("SELECT 1")
    } finally {
      client.release()
    }
    if (mode === "claim" && getPool(id)) {
      // Someone else (user click) won the race during our dial — drop ours.
      await pool.end().catch(() => {})
      return { ok: true }
    }
    setPool(id, pool, conn.accessMode)
    void introspect(pool)
      .then((ns) => writeConnectionSchema(id, ns))
      .catch((err) => console.warn(`[introspect ${id}]`, err))
    return { ok: true }
  } catch (err) {
    await pool.end().catch(() => {})
    return { ok: false, error: normalizePgError(err).message, status: 400 }
  }
}

// Best-effort: dial every saved connection at boot so the UI shows them as
// Active without a manual click. Skips ids that already have a pool (a user
// click could win the race before this finishes).
export async function autoConnectAll(workspace: string): Promise<void> {
  const store = new ConnectionStore(workspace)
  const vault = new CredentialVault(workspace)
  const connections = await store.list()
  await Promise.all(
    connections.map(async (conn) => {
      if (getPool(conn.id)) return
      const result = await connectStored(conn.id, store, vault, "claim")
      if (result.ok) {
        console.log(`[auto-connect] ${conn.name} (${conn.id})`)
      } else if (result.error !== "missing_credentials") {
        console.warn(`[auto-connect] ${conn.name}: ${result.error}`)
      }
    }),
  )
}

export function connectionsRouter(workspace: string): Hono {
  const router = new Hono()
  const store = new ConnectionStore(workspace)
  const vault = new CredentialVault(workspace)

  router.get("/", async (c) => {
    const connections = await store.list()
    const active = activeIds()
    return c.json({ connections: connections.map((conn) => toApi(conn, active)) })
  })

  router.post("/", async (c) => {
    let input
    try {
      input = parseInput(await c.req.json())
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
    const stored: StoredConnection = {
      id: crypto.randomUUID(),
      name: input.name,
      driver: "postgres",
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      ssl: input.ssl,
      accessMode: input.accessMode,
      createdAt: new Date().toISOString(),
    }
    await store.add(stored)
    if (input.password) await vault.setPassword(stored.id, input.password)
    return c.json({ connection: toApi(stored, activeIds()) }, 201)
  })

  router.patch("/:id", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    let parsed
    try {
      parsed = parsePatch(await c.req.json())
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
    const updated = await store.update(id, parsed.patch)
    if (!updated) return c.json({ error: "not_found" }, 404)
    // Write the new password (if any) before any reconnect so the live pool
    // picks up the updated credential.
    if (parsed.password !== undefined) {
      await vault.setPassword(id, parsed.password)
    }
    // If the connection is live, recreate its pool so the edit applies now: the
    // read-only GUC is fixed at connection startup, and host/port/user/password
    // changes only take effect on a fresh pool. If the reconnect fails (e.g. a
    // bad new host), drop the pool rather than leave a stale session running
    // under changed metadata.
    if (getPool(id)) {
      const result = await connectStored(id, store, vault)
      if (!result.ok) {
        await removePool(id)
        return c.json({ ok: false, error: result.error }, 400)
      }
    }
    return c.json({ connection: toApi(updated, activeIds()) })
  })

  router.delete("/:id", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    await removePool(id)
    await vault.deletePassword(id)
    await store.remove(id)
    await fs.rm(paths.connectionSchema(id), { force: true }).catch(() => {})
    return c.json({ ok: true })
  })

  router.post("/test", async (c) => {
    let input
    try {
      input = parseInput(await c.req.json())
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
    try {
      await testConnection(buildProbe(input), input.password)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
  })

  // Test an edit against an existing connection: probe with the submitted
  // (edited) fields, but fall back to the stored password when the form leaves
  // it blank — mirroring how PATCH keeps the existing credential. Without this,
  // testing an edit you didn't retype the password for would fail auth even
  // though saving would succeed.
  router.post("/:id/test", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    let input
    try {
      input = parseInput(await c.req.json())
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
    let password = input.password
    if (!password) {
      const stored = await vault.getPassword(id)
      if (stored === null) {
        return c.json(
          { ok: false, error: "No stored password — enter one to test." },
          400,
        )
      }
      password = stored
    }
    try {
      await testConnection(buildProbe(input), password)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
  })

  router.post("/:id/connect", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    const result = await connectStored(id, store, vault)
    if (result.ok) return c.json({ ok: true })
    if (result.error === "not_found") return c.json({ error: "not_found" }, 404)
    return c.json({ ok: false, error: result.error }, 400)
  })

  router.post("/:id/query", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    const pool = getPool(id)
    if (!pool) return c.json({ ok: false, error: "not_connected" }, 409)
    let sql: string
    try {
      const body = (await c.req.json()) as { sql?: unknown }
      if (typeof body.sql !== "string" || body.sql.trim() === "") {
        return c.json({ ok: false, error: "Missing sql" }, 400)
      }
      sql = body.sql
    } catch {
      return c.json({ ok: false, error: "Invalid JSON body" }, 400)
    }
    const started = Date.now()
    try {
      const result = await runWithRetry(pool, (p) =>
        p.query({ text: sql, rowMode: "array" }),
      )
      const durationMs = Date.now() - started
      const allRows = Array.isArray(result.rows) ? (result.rows as unknown[][]) : []
      const truncated = allRows.length > MAX_ROWS
      const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows
      const payload: QueryOk = {
        ok: true,
        columns: (result.fields ?? []).map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
        rows,
        rowCount: typeof result.rowCount === "number" ? result.rowCount : rows.length,
        durationMs,
        truncated,
      }
      return c.json(payload)
    } catch (err) {
      const normalized = normalizePgError(err)
      const code = (err as { code?: string })?.code
      return c.json({ ok: false, error: normalized.message, code }, 200)
    }
  })

  router.get("/:id/schema", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    try {
      const raw = await fs.readFile(paths.connectionSchema(id), "utf8")
      return c.json(JSON.parse(raw) as SQLNamespace)
    } catch {
      return c.json({} satisfies SQLNamespace)
    }
  })

  router.post("/:id/schema/refresh", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    const pool = getPool(id)
    if (!pool) return c.json({ ok: false, error: "not_connected" }, 409)
    try {
      const schema = await runWithRetry(pool, (p) => introspect(p), "idempotent")
      await writeConnectionSchema(id, schema)
      return c.json(schema)
    } catch (err) {
      return c.json({ ok: false, error: normalizePgError(err).message }, 500)
    }
  })

  router.post("/:id/disconnect", async (c) => {
    const id = c.req.param("id")
    assertSafeConnectionId(id)
    await removePool(id)
    return c.json({ ok: true })
  })

  return router
}
