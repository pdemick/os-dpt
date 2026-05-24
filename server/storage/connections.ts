import { promises as fs } from "node:fs"
import path from "node:path"

import type { AccessMode, Driver } from "@shared/connections.ts"

export type StoredConnection = {
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
}

// Connections written before accessMode existed have no field; treat them as
// read-write so upgrading the app never silently revokes write access.
function normalize(conn: StoredConnection): StoredConnection {
  return {
    ...conn,
    accessMode: conn.accessMode === "read-only" ? "read-only" : "read-write",
  }
}

const FILE = "connections.json"

export class ConnectionStore {
  constructor(private readonly workspace: string) {}

  // Serializes read-modify-write cycles so concurrent add/remove calls
  // don't clobber each other.
  private queue: Promise<unknown> = Promise.resolve()

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => {})
    return next
  }

  private get filePath(): string {
    return path.join(this.workspace, FILE)
  }

  async list(): Promise<StoredConnection[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      const data = JSON.parse(raw) as { connections?: StoredConnection[] }
      return Array.isArray(data.connections) ? data.connections.map(normalize) : []
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
      throw err
    }
  }

  async get(id: string): Promise<StoredConnection | null> {
    const all = await this.list()
    return all.find((c) => c.id === id) ?? null
  }

  add(conn: StoredConnection): Promise<void> {
    return this.enqueue(async () => {
      const existing = await this.list()
      await this.write([...existing.filter((c) => c.id !== conn.id), conn])
    })
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const existing = await this.list()
      await this.write(existing.filter((c) => c.id !== id))
    })
  }

  // Apply a partial patch to one connection's metadata. Returns the updated
  // record, or null if no connection has that id. id/createdAt are immutable.
  update(
    id: string,
    patch: Partial<Omit<StoredConnection, "id" | "createdAt">>,
  ): Promise<StoredConnection | null> {
    return this.enqueue(async () => {
      const existing = await this.list()
      const current = existing.find((c) => c.id === id)
      if (!current) return null
      const updated = normalize({ ...current, ...patch, id: current.id })
      await this.write(existing.map((c) => (c.id === id ? updated : c)))
      return updated
    })
  }

  private async write(connections: StoredConnection[]): Promise<void> {
    await fs.mkdir(this.workspace, { recursive: true })
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ connections }, null, 2) + "\n",
      "utf8",
    )
  }
}
