import { Hono } from "hono"
import { promises as fs } from "node:fs"
import path from "node:path"
import { assertSafeSlug, paths } from "../workspace.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import { dedupeSlug, slugify } from "../lib/slug.ts"
import type { WorksheetMeta, WorksheetPayload } from "@shared/types.ts"

const app = new Hono()

async function listMetas(): Promise<WorksheetMeta[]> {
  const dir = paths.worksheets()
  const entries = await fs.readdir(dir).catch(() => [])
  const sqls = entries.filter((f) => f.endsWith(".sql"))
  const metas = await Promise.all(
    sqls.map(async (f) => {
      const slug = f.slice(0, -4)
      const stat = await fs.stat(path.join(dir, f))
      return { slug, name: slug, updatedAt: stat.mtime.toISOString() } satisfies WorksheetMeta
    }),
  )
  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return metas
}

async function readDraft(slug: string): Promise<string | null> {
  try {
    return await fs.readFile(paths.draft(slug), "utf8")
  } catch {
    return null
  }
}

app.get("/", async (c) => {
  return c.json({ worksheets: await listMetas() })
})

app.post("/", async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string })
  const desired = slugify(body.name ?? "untitled")
  const existing = new Set((await listMetas()).map((m) => m.slug))
  const slug = dedupeSlug(desired, existing)
  await writeAtomic(paths.worksheet(slug), "")
  const stat = await fs.stat(paths.worksheet(slug))
  return c.json({ slug, name: slug, updatedAt: stat.mtime.toISOString() } satisfies WorksheetMeta)
})

app.get("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const file = paths.worksheet(slug)
  let content: string
  try {
    content = await fs.readFile(file, "utf8")
  } catch {
    return c.json({ error: "not_found" }, 404)
  }
  const stat = await fs.stat(file)
  const draftContent = await readDraft(slug)
  const payload: WorksheetPayload = {
    meta: { slug, name: slug, updatedAt: stat.mtime.toISOString() },
    content,
    draftContent,
  }
  return c.json(payload)
})

app.put("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const { content } = await c.req.json<{ content: string }>()
  await writeAtomic(paths.worksheet(slug), content)
  // dropping draft on explicit save is the caller's choice; the drafts route handles delete
  const stat = await fs.stat(paths.worksheet(slug))
  return c.json({ slug, name: slug, updatedAt: stat.mtime.toISOString() } satisfies WorksheetMeta)
})

app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  await fs.rm(paths.worksheet(slug), { force: true })
  await fs.rm(paths.draft(slug), { force: true })
  return c.json({ ok: true })
})

export default app
