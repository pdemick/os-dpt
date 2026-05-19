import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { workspaceRoot } from "../workspace.ts"
import type { GitCommitItem } from "@shared/types.ts"

const exec = promisify(execFile)
const MAX_BUFFER = 4 * 1024 * 1024
const TIMEOUT_MS = 5_000

function worksheetRelPath(slug: string): string {
  return path.posix.join("worksheets", `${slug}.sql`)
}

export async function listGitCommits(slug: string): Promise<GitCommitItem[]> {
  const cwd = workspaceRoot()
  try {
    const { stdout } = await exec(
      "git",
      [
        "log",
        // --follow walks through renames so a worksheet's pre-rename history
        // still shows up in the timeline.
        "--follow",
        "--format=%H%x00%ct%x00%an%x00%s",
        "--",
        worksheetRelPath(slug),
      ],
      { cwd, maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
    )
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, ct, an, subject] = line.split("\0")
        return {
          kind: "git" as const,
          sha,
          ts: Number(ct) * 1000,
          author: an || null,
          subject: subject || "",
        }
      })
  } catch {
    return []
  }
}

export async function readFileAtCommit(sha: string, slug: string): Promise<string | null> {
  const cwd = workspaceRoot()
  try {
    const { stdout } = await exec("git", ["show", `${sha}:${worksheetRelPath(slug)}`], {
      cwd,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    })
    return stdout
  } catch {
    return null
  }
}
