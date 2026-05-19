import { Hono } from "hono"
import { promises as fs } from "node:fs"
import { assertSafeSlug, paths } from "../workspace.ts"
import { getEntry, listEntries, revertToEntry } from "../history/query.ts"
import { buildTimeline } from "../history/timeline.ts"
import { readFileAtCommit } from "../history/git.ts"
import type { WorksheetMeta } from "@shared/types.ts"

const app = new Hono()

app.get("/:slug", (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  return c.json({ entries: listEntries(slug) })
})

app.get("/:slug/timeline", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  return c.json({ items: await buildTimeline(slug) })
})

app.get("/:slug/entry/:id", (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "bad_id" }, 400)
  const entry = getEntry(slug, id)
  if (!entry) return c.json({ error: "not_found" }, 404)
  return c.json({ entry })
})

app.get("/:slug/git/:sha", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const sha = c.req.param("sha")
  if (!/^[a-f0-9]{7,40}$/.test(sha)) return c.json({ error: "bad_sha" }, 400)
  const content = await readFileAtCommit(sha, slug)
  if (content === null) return c.json({ error: "not_found" }, 404)
  return c.json({ sha, content })
})

app.post("/:slug/revert/:id", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const id = Number(c.req.param("id"))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "bad_id" }, 400)
  const entry = await revertToEntry(slug, id)
  if (!entry) return c.json({ error: "not_found" }, 404)
  const stat = await fs.stat(paths.worksheet(slug))
  const meta: WorksheetMeta = { slug, name: slug, updatedAt: stat.mtime.toISOString() }
  return c.json({ meta, content: entry.content })
})

export default app
