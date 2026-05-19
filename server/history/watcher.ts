import { promises as fs, watch, type FSWatcher } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { paths } from "../workspace.ts"
import { recordHistory } from "./record.ts"
import { isRecentWrite } from "./dedup.ts"

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i
let watcher: FSWatcher | null = null

// We only watch the git-tracked worksheets/ directory. Drafts live in
// .os-dpt/drafts/ and flow through the API (PUT /api/drafts/:slug), so
// recordHistory already runs for every autosave — no second watcher needed.
// The trade-off: direct file edits to a draft file (not via the editor or
// any other tool that calls the drafts API) won't be captured. That's
// acceptable because drafts are an internal staging area; users edit
// worksheets/<slug>.sql when they reach for an external editor.
export function startWorksheetsWatcher(): void {
  const dir = paths.worksheets()
  watcher = watch(dir, (eventType, filename) => {
    if (!filename || !filename.endsWith(".sql")) return
    if (eventType !== "change" && eventType !== "rename") return
    const slug = filename.slice(0, -4)
    if (!SLUG_RE.test(slug)) return
    void handleEvent(slug, path.join(dir, filename))
  })
  watcher.on("error", (err) => {
    console.warn("[history watcher]", err.message)
  })
}

async function handleEvent(slug: string, filePath: string): Promise<void> {
  let content: string
  try {
    content = await fs.readFile(filePath, "utf8")
  } catch {
    return // file may have been deleted between event and read
  }
  const sha = createHash("sha256").update(content, "utf8").digest("hex")
  if (isRecentWrite(slug, sha)) return // echo of a write we just did
  recordHistory({ worksheet: slug, source: "external", content })
}

export function stopWorksheetsWatcher(): void {
  watcher?.close()
  watcher = null
}
