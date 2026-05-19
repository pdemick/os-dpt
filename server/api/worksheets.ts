import { Hono } from "hono"
import { promises as fs } from "node:fs"
import path from "node:path"
import { assertSafeSlug, paths } from "../workspace.ts"
import { writeAtomic } from "../lib/fs-atomic.ts"
import { dedupeSlug, slugify } from "../lib/slug.ts"
import { recordHistory } from "../history/record.ts"
import { deleteWorksheetHistory, hasEntries } from "../history/query.ts"
import {
  deleteName,
  getName,
  readNames,
  setName,
} from "../storage/worksheet-names.ts"
import { generateWorksheetName } from "../agent/naming.ts"
import type { WorksheetMeta, WorksheetPayload } from "@shared/types.ts"

const app = new Hono()
const MAX_NAME_LEN = 80

async function listMetas(): Promise<WorksheetMeta[]> {
  const dir = paths.worksheets()
  const entries = await fs.readdir(dir).catch(() => [])
  const sqls = entries.filter((f) => f.endsWith(".sql"))
  const names = await readNames()
  const metas = await Promise.all(
    sqls.map(async (f) => {
      const slug = f.slice(0, -4)
      const stat = await fs.stat(path.join(dir, f))
      return {
        slug,
        name: names[slug] ?? slug,
        updatedAt: stat.mtime.toISOString(),
      } satisfies WorksheetMeta
    }),
  )
  metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return metas
}

async function metaFor(slug: string): Promise<WorksheetMeta> {
  const stat = await fs.stat(paths.worksheet(slug))
  const name = (await getName(slug)) ?? slug
  return { slug, name, updatedAt: stat.mtime.toISOString() }
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
  // Order matters: recordHistory must precede writeAtomic so the empty-string
  // sha is registered via noteRecentWrite before fs.watch fires for the new file.
  recordHistory({ worksheet: slug, source: "save", content: "" })
  await writeAtomic(paths.worksheet(slug), "")
  return c.json(await metaFor(slug))
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
  if (!hasEntries(slug)) {
    // First time we've seen this worksheet — seed the timeline with the
    // on-disk content as a "snapshot" rather than mislabelling it as an
    // external edit.
    recordHistory({ worksheet: slug, source: "snapshot", content, ts: stat.mtimeMs })
  }
  const draftContent = await readDraft(slug)
  const meta = await metaFor(slug)
  const payload: WorksheetPayload = { meta, content, draftContent }
  return c.json(payload)
})

app.put("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const { content } = await c.req.json<{ content: string }>()
  const result = recordHistory({ worksheet: slug, source: "save", content })
  await writeAtomic(paths.worksheet(slug), content)
  // dropping draft on explicit save is the caller's choice; the drafts route handles delete
  const meta = await metaFor(slug)
  return c.json({ ...meta, historySkipped: result.skipped ?? null })
})

app.patch("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string })
  const raw = (body.name ?? "").trim()
  if (!raw) return c.json({ error: "empty_name" }, 400)
  const name = raw.length > MAX_NAME_LEN ? raw.slice(0, MAX_NAME_LEN) : raw
  await setName(slug, name)
  return c.json(await metaFor(slug))
})

app.post("/:slug/auto-name", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  const existing = await getName(slug)
  if (existing && existing !== slug) {
    return c.json({ name: existing, skipped: true, reason: "already-named" as const })
  }
  // Prefer SQL supplied by the client (the live buffer) — the worksheet file
  // on disk is empty until Cmd+S, and the draft file is debounced.
  const body = await c.req.json<{ sql?: string }>().catch(() => ({}) as { sql?: string })
  let sql = (body.sql ?? "").trim()
  if (!sql) {
    try {
      sql = (await fs.readFile(paths.draft(slug), "utf8")).trim()
    } catch {
      // no draft yet
    }
  }
  if (!sql) {
    try {
      sql = (await fs.readFile(paths.worksheet(slug), "utf8")).trim()
    } catch {
      return c.json({ error: "not_found" }, 404)
    }
  }
  if (!sql) {
    return c.json({ name: slug, skipped: true, reason: "empty" as const })
  }
  try {
    const name = await generateWorksheetName(sql)
    await setName(slug, name)
    return c.json({ name, skipped: false })
  } catch (err) {
    console.warn(`auto-name failed for ${slug}:`, (err as Error).message)
    return c.json({ name: slug, skipped: true, reason: "model-error" as const })
  }
})

app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug")
  assertSafeSlug(slug)
  await fs.rm(paths.worksheet(slug), { force: true })
  await fs.rm(paths.draft(slug), { force: true })
  deleteWorksheetHistory(slug)
  await deleteName(slug)
  return c.json({ ok: true })
})

export default app
