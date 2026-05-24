export type Driver = "postgres"

// Whether os-dpt allows writes through a connection. "read-only" sets the
// Postgres session default (default_transaction_read_only), so the database
// rejects plain INSERT/UPDATE/DELETE/DDL — a guard against accidental writes
// rather than a hard boundary (a session can opt back into writes; see
// server/db/postgres.ts).
export type AccessMode = "read-write" | "read-only"

export type Connection = {
  id: string
  name: string
  driver: Driver
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  accessMode: AccessMode
  createdAt: string
  active: boolean
}

export type NewConnectionInput = {
  name: string
  driver: Driver
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  accessMode: AccessMode
}

export type TestResult = { ok: true } | { ok: false; error: string }
