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

// Sentinel for our --format lines. The trailing \0 means a commit subject
// that happens to start with this literal still can't be misparsed: the next
// field after the sentinel must be a 40-char SHA followed by \0.
const HEADER = "__osdpt_commit__\0"
const HEADER_LINE = /^__osdpt_commit__\0[0-9a-f]{40}\0/

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
        // --raw lines (`:mode mode srcSha dstSha STATUS\tpath`) give us the
        // post-change blob sha per commit, so the client can drop entries
        // identical to the current editor buffer.
        "--raw",
        "--no-abbrev",
        `--format=__osdpt_commit__%x00%H%x00%ct%x00%an%x00%s`,
        "--",
        worksheetRelPath(slug),
      ],
      { cwd, maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
    )
    const items: GitCommitItem[] = []
    let pending: GitCommitItem | null = null
    const flush = () => {
      if (pending) items.push(pending)
      pending = null
    }
    for (const line of stdout.split("\n")) {
      if (HEADER_LINE.test(line)) {
        flush()
        const [sha, ct, an, subject] = line.slice(HEADER.length).split("\0")
        pending = {
          kind: "git",
          sha,
          ts: Number(ct) * 1000,
          author: an || null,
          subject: subject || "",
          contentSha: null,
        }
      } else if (line.startsWith(":") && pending && pending.contentSha === null) {
        // Raw fields are space-separated; the path tail (which may include
        // tabs for renames) is split off by the first tab. We only need
        // the dst sha at index 3 of the prefix.
        const prefix = line.split("\t", 1)[0]
        const dst = prefix.split(" ")[3]
        if (dst && /^[0-9a-f]{40}$/.test(dst)) pending.contentSha = dst
      }
    }
    flush()
    return items
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
