import { promises as fs } from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"

const WORKSHEETS_DIR = "worksheets"
const OSDPT_DIR = ".os-dpt"
const DRAFTS_DIR = path.join(OSDPT_DIR, "drafts")
const SESSION_FILE = path.join(OSDPT_DIR, "session.json")
const SCHEMA_FILE = path.join(OSDPT_DIR, "schema.json")
const GITIGNORE = ".gitignore"

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
  await fs.mkdir(path.join(root, DRAFTS_DIR), { recursive: true })

  const sessionPath = path.join(root, SESSION_FILE)
  try {
    await fs.access(sessionPath)
  } catch {
    await fs.writeFile(sessionPath, JSON.stringify({ openTabs: [], activeSlug: null }, null, 2))
  }

  await ensureGitignored(root)

  resolved = root
  return root
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
  drafts: () => workspacePath(DRAFTS_DIR),
  draft: (slug: string) => workspacePath(DRAFTS_DIR, `${slug}.sql`),
  session: () => workspacePath(SESSION_FILE),
  schema: () => workspacePath(SCHEMA_FILE),
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]*$/i

export function assertSafeSlug(slug: string): void {
  if (!SLUG_RE.test(slug) || slug.includes("..") || slug.length > 100) {
    throw new HTTPException(400, { message: `Invalid slug: ${slug}` })
  }
}
