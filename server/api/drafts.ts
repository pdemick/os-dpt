import { Hono } from "hono"
import { promises as fs } from "node:fs"
import { assertSafeSlug, paths } from "../workspace.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import { recordHistory } from "../history/record.ts"

const app = new Hono()

app.put("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const { content } = await c.req.json<{ content: string }>()
  const result = recordHistory({ worksheet: slug, source: "autosave", content })
  await writeAtomic(paths.draft(slug), content)
  return c.json({ ok: true, historySkipped: result.skipped ?? null })
})

app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  await fs.rm(paths.draft(slug), { force: true })
  return c.json({ ok: true })
})

export default app
