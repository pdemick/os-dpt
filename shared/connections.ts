export type Driver = "postgres"

// Whether os-dpt allows writes through a connection. "read-only" is enforced at
// the Postgres session level (default_transaction_read_only), so the database
// itself rejects INSERT/UPDATE/DELETE/DDL — not just a client-side guess.
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
