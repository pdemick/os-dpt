export type Driver = "postgres"

export type Connection = {
  id: string
  name: string
  driver: Driver
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
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
}

export type TestResult = { ok: true } | { ok: false; error: string }
