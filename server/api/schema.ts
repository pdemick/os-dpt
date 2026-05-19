import { Hono } from "hono"
import { promises as fs } from "node:fs"
import { paths } from "../workspace.ts"
import type { SQLNamespace } from "@shared/types.ts"

const app = new Hono()

const EMPTY: SQLNamespace = {}

app.get("/", async (c) => {
  try {
    const raw = await fs.readFile(paths.schema(), "utf8")
    return c.json(JSON.parse(raw) as SQLNamespace)
  } catch {
    return c.json(EMPTY)
  }
})

export default app
