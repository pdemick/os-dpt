import crypto from "node:crypto"

import { Hono } from "hono"

import type { Connection, NewConnectionInput } from "@shared/connections.ts"

import { CredentialVault } from "../credentials/vault.ts"
import { createPool, normalizePgError, testConnection } from "../db/postgres.ts"
import { activeIds, removePool, setPool } from "../db/registry.ts"
import { ConnectionStore, type StoredConnection } from "../storage/connections.ts"

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
  }
}

function toApi(conn: StoredConnection, active: Set<string>): Connection {
  return { ...conn, active: active.has(conn.id) }
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
      createdAt: new Date().toISOString(),
    }
    await store.add(stored)
    if (input.password) await vault.setPassword(stored.id, input.password)
    return c.json({ connection: toApi(stored, activeIds()) }, 201)
  })

  router.delete("/:id", async (c) => {
    const id = c.req.param("id")
    await removePool(id)
    await vault.deletePassword(id)
    await store.remove(id)
    return c.json({ ok: true })
  })

  router.post("/test", async (c) => {
    let input
    try {
      input = parseInput(await c.req.json())
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
    const probe: StoredConnection = {
      id: "probe",
      name: input.name,
      driver: "postgres",
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      ssl: input.ssl,
      createdAt: new Date().toISOString(),
    }
    try {
      await testConnection(probe, input.password)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
  })

  router.post("/:id/connect", async (c) => {
    const id = c.req.param("id")
    const conn = await store.get(id)
    if (!conn) return c.json({ error: "not_found" }, 404)
    const password = await vault.getPassword(id)
    if (password === null) {
      return c.json({ ok: false, error: "missing_credentials" }, 400)
    }
    const pool = createPool(conn, password)
    try {
      const client = await pool.connect()
      try {
        await client.query("SELECT 1")
      } finally {
        client.release()
      }
      setPool(id, pool)
      return c.json({ ok: true })
    } catch (err) {
      await pool.end().catch(() => {})
      return c.json({ ok: false, error: normalizePgError(err).message }, 400)
    }
  })

  router.post("/:id/disconnect", async (c) => {
    await removePool(c.req.param("id"))
    return c.json({ ok: true })
  })

  return router
}
