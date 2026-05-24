import { Hono } from "hono"
import { promises as fs } from "node:fs"
import { HTTPException } from "hono/http-exception"

import {
  CONTEXT_DOCS,
  type ContextDocMeta,
  type ContextDocName,
} from "@shared/context.ts"

import { writeAtomic } from "../lib/fs-atomic.ts"
import { assertSafeConnectionId, paths } from "../workspace.ts"

const app = new Hono()

// 256 KiB ceiling — context docs are agent memory, not data dumps. Keeps a
// pathological paste from bloating the git-tracked workspace.
const MAX_DOC_BYTES = 256 * 1024

function defFor(name: string) {
  return CONTEXT_DOCS.find((d) => d.name === name)
}

// `?connectionId=` scopes to a data source; absent → the unassigned set. Any
// provided id is validated before it reaches a filesystem path.
function scopeOf(c: { req: { query(k: string): string | undefined } }): string | null {
  const id = c.req.query("connectionId")
  if (!id) return null
  assertSafeConnectionId(id)
  return id
}

async function readMeta(name: ContextDocName, connectionId: string | null): Promise<ContextDocMeta> {
  const def = CONTEXT_DOCS.find((d) => d.name === name)!
  try {
    const st = await fs.stat(paths.contextFile(name, connectionId))
    return { ...def, updatedAt: st.mtime.toISOString(), size: st.size }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    return { ...def, updatedAt: null, size: 0 }
  }
}

async function readContent(name: ContextDocName, connectionId: string | null): Promise<string> {
  try {
    return await fs.readFile(paths.contextFile(name, connectionId), "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw err
  }
}

// GET /api/context?connectionId= — list all docs with metadata (no content).
app.get("/", async (c) => {
  const connectionId = scopeOf(c)
  const docs = await Promise.all(CONTEXT_DOCS.map((d) => readMeta(d.name, connectionId)))
  return c.json({ connectionId, docs })
})

// GET /api/context/:name?connectionId= — one doc's metadata + full content.
app.get("/:name", async (c) => {
  const name = c.req.param("name")
  if (!defFor(name)) throw new HTTPException(404, { message: `Unknown context doc: ${name}` })
  const docName = name as ContextDocName
  const connectionId = scopeOf(c)
  const [meta, content] = await Promise.all([
    readMeta(docName, connectionId),
    readContent(docName, connectionId),
  ])
  return c.json({ meta, content })
})

// PUT /api/context/:name?connectionId= — overwrite a doc's content.
app.put("/:name", async (c) => {
  const name = c.req.param("name")
  if (!defFor(name)) throw new HTTPException(404, { message: `Unknown context doc: ${name}` })
  const docName = name as ContextDocName
  const connectionId = scopeOf(c)

  const body = (await c.req.json().catch(() => ({}))) as { content?: unknown }
  if (typeof body.content !== "string") {
    throw new HTTPException(400, { message: "content must be a string" })
  }
  if (Buffer.byteLength(body.content, "utf8") > MAX_DOC_BYTES) {
    throw new HTTPException(413, { message: "context doc exceeds 256 KiB" })
  }

  // Normalize to a single trailing newline so git diffs stay clean, matching
  // how update_context writes these files.
  const text =
    body.content === "" ? "" : body.content.replace(/\n*$/, "") + "\n"
  await writeAtomic(paths.contextFile(docName, connectionId), text)

  const meta = await readMeta(docName, connectionId)
  return c.json({ meta })
})

export default app
