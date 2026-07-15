import { promises as fs } from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { HTTPException } from "hono/http-exception"

import { CONTEXT_DOC_NAMES, type ContextDocName } from "@shared/context.ts"

const exec = promisify(execFile)

const WORKSHEETS_DIR = "worksheets"
const DASHBOARDS_DIR = "dashboards"
const CONTEXT_DIR = "context"
// Per-data-source context docs live under context/by-source/<connection-id>/;
// docs with no connection bound stay at the context/ root (the "unassigned" set).
const CONTEXT_BY_SOURCE = "by-source"
const OSDPT_DIR = ".os-dpt"
const DRAFTS_DIR = path.join(OSDPT_DIR, "drafts")
const CHATS_DIR = path.join(OSDPT_DIR, "chats")
const SCHEMAS_DIR = path.join(OSDPT_DIR, "schemas")
const SESSION_FILE = path.join(OSDPT_DIR, "session.json")
const SCHEMA_FILE = path.join(OSDPT_DIR, "schema.json")
const HISTORY_FILE = path.join(OSDPT_DIR, "history.db")
const GITIGNORE = ".gitignore"

// Canonical context-doc set lives in shared/context.ts; re-exported here under
// the names the agent tools already import.
export const CONTEXT_FILES = CONTEXT_DOC_NAMES
export type ContextFile = ContextDocName

let resolved: string | null = null

function parseWorkspaceArg(argv: string[]): string {
  const idx = argv.indexOf("--workspace")
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1]
  return process.cwd()
}

export function resolveWorkspace(argv: string[]): string {
  return path.resolve(parseWorkspaceArg(argv))
}

export async function initWorkspace(argv: string[] = process.argv.slice(2)): Promise<string> {
  const root = resolveWorkspace(argv)
  await fs.mkdir(path.join(root, WORKSHEETS_DIR), { recursive: true })
  await fs.mkdir(path.join(root, DASHBOARDS_DIR), { recursive: true })
  await fs.mkdir(path.join(root, DRAFTS_DIR), { recursive: true })
  await fs.mkdir(path.join(root, CHATS_DIR), { recursive: true })
  await fs.mkdir(path.join(root, CONTEXT_DIR), { recursive: true })
  await fs.mkdir(path.join(root, SCHEMAS_DIR), { recursive: true })

  const sessionPath = path.join(root, SESSION_FILE)
  try {
    await fs.access(sessionPath)
  } catch {
    await fs.writeFile(
      sessionPath,
      JSON.stringify({ openTabs: [], activeSlug: null, resultsPaneSize: null }, null, 2),
    )
  }

  await ensureGitRepo(root)
  await ensureGitignored(root)

  resolved = root
  return root
}

// Worksheet/context history is backed by git (see history/git.ts). If the
// workspace isn't already in a git work tree, init one so history works out of
// the box. Best-effort: a missing `git` binary just logs a hint and the
// history features stay empty (which they already degrade to gracefully).
async function ensureGitRepo(root: string): Promise<void> {
  try {
    await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root })
    return // already a repo
  } catch {
    // not a repo, or git unavailable — try to init below
  }
  try {
    await exec("git", ["init"], { cwd: root })
    console.log(`os-dpt: initialized a git repository in ${root} for worksheet history`)
  } catch {
    console.warn(
      "os-dpt: git not found — worksheet history is disabled. Install git and run `git init` here to enable it.",
    )
  }
}

async function ensureGitignored(root: string): Promise<void> {
  const gitignorePath = path.join(root, GITIGNORE)
  let current = ""
  try {
    current = await fs.readFile(gitignorePath, "utf8")
  } catch {
    // no existing .gitignore — fine, we'll create one
  }
  const needs = ["/.os-dpt/"]
  const missing = needs.filter((line) => !current.split("\n").some((l) => l.trim() === line))
  if (missing.length === 0) return
  const append = (current.endsWith("\n") || current === "" ? "" : "\n") + missing.join("\n") + "\n"
  await fs.writeFile(gitignorePath, current + append)
}

export function workspaceRoot(): string {
  if (!resolved) throw new Error("Workspace not initialized")
  return resolved
}

export function workspacePath(...segments: string[]): string {
  return path.join(workspaceRoot(), ...segments)
}

export const paths = {
  worksheets: () => workspacePath(WORKSHEETS_DIR),
  worksheet: (slug: string) => workspacePath(WORKSHEETS_DIR, `${slug}.sql`),
  dashboards: () => workspacePath(DASHBOARDS_DIR),
  dashboard: (slug: string) => workspacePath(DASHBOARDS_DIR, `${slug}.json`),
  drafts: () => workspacePath(DRAFTS_DIR),
  draft: (slug: string) => workspacePath(DRAFTS_DIR, `${slug}.sql`),
  schemas: () => workspacePath(SCHEMAS_DIR),
  connectionSchema: (id: string) => workspacePath(SCHEMAS_DIR, `${id}.json`),
  session: () => workspacePath(SESSION_FILE),
  schema: () => workspacePath(SCHEMA_FILE),
  history: () => workspacePath(HISTORY_FILE),
  chats: () => workspacePath(CHATS_DIR),
  chat: (id: string) => workspacePath(CHATS_DIR, `${id}.json`),
  context: () => workspacePath(CONTEXT_DIR),
  // `connectionId` scopes docs to a data source; null/undefined → the
  // workspace-root "unassigned" set.
  contextDir: (connectionId?: string | null) =>
    connectionId
      ? workspacePath(CONTEXT_DIR, CONTEXT_BY_SOURCE, connectionId)
      : workspacePath(CONTEXT_DIR),
  contextFile: (name: ContextFile, connectionId?: string | null) =>
    connectionId
      ? workspacePath(CONTEXT_DIR, CONTEXT_BY_SOURCE, connectionId, `${name}.md`)
      : workspacePath(CONTEXT_DIR, `${name}.md`),
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/i

export function assertSafeSlug(slug: string): void {
  if (!SLUG_RE.test(slug) || slug.includes("..") || slug.length > 100) {
    throw new HTTPException(400, { message: `Invalid slug: ${slug}` })
  }
}

const CHAT_ID_RE = /^[a-z0-9][a-z0-9-]*$/i

export function assertSafeChatId(id: string): void {
  if (!CHAT_ID_RE.test(id) || id.includes("..") || id.length > 64) {
    throw new HTTPException(400, { message: `Invalid chat id: ${id}` })
  }
}

// Connection ids are server-minted UUIDs; reject anything else before it's
// interpolated into a filesystem path (context/by-source/<id>/…).
const CONNECTION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSafeConnectionId(id: string): boolean {
  return CONNECTION_ID_RE.test(id)
}

export function assertSafeConnectionId(id: string): void {
  if (!isSafeConnectionId(id)) {
    throw new HTTPException(400, { message: `Invalid connection id` })
  }
}
