import { promises as fs } from "node:fs"
import path from "node:path"

import type { Driver } from "@shared/connections.ts"

export type StoredConnection = {
  id: string
  name: string
  driver: Driver
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
  createdAt: string
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
      return Array.isArray(data.connections) ? data.connections : []
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

  private async write(connections: StoredConnection[]): Promise<void> {
    await fs.mkdir(this.workspace, { recursive: true })
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ connections }, null, 2) + "\n",
      "utf8",
    )
  }
}
