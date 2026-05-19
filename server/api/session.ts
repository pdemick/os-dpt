import { Hono } from "hono"
import { promises as fs } from "node:fs"
import { paths } from "../workspace.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import type { Session } from "@shared/types.ts"

const app = new Hono()

const EMPTY: Session = { openTabs: [], activeSlug: null, resultsPaneSize: null }

app.get("/", async (c) => {
  try {
    const raw = await fs.readFile(paths.session(), "utf8")
    return c.json(JSON.parse(raw) as Session)
  } catch {
    return c.json(EMPTY)
  }
})

app.put("/", async (c) => {
  const body = await c.req.json<Session>()
  await writeAtomic(paths.session(), JSON.stringify(body, null, 2))
  return c.json({ ok: true })
})

export default app
