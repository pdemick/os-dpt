import { promises as fs } from "node:fs"

import type { ContextUpdateDetail } from "@shared/agent.ts"

import { writeAtomic } from "../../lib/fs-atomic.ts"
import { CONTEXT_FILES, type ContextFile, isSafeConnectionId, paths } from "../../workspace.ts"

import type { AgentTool } from "./index.ts"

interface Input {
  file?: string
  mode?: string
  content?: string
}

function isContextFile(v: string): v is ContextFile {
  return (CONTEXT_FILES as readonly string[]).includes(v)
}

/** Unchanged lines kept around the change in the detail payload. */
const DETAIL_CONTEXT_LINES = 8

function toLines(text: string): string[] {
  return text === "" ? [] : text.replace(/\n$/, "").split("\n")
}

/**
 * The before/after snapshots the UI diffs. Context files grow without bound
 * (append mode date-stamps blocks forever), so sending both in full would make
 * every update_context event scale with the file's lifetime. Trim the shared
 * prefix/suffix down to a few context lines and report the trimmed counts so
 * the UI can render hidden-line markers; the diff itself is unaffected — the
 * client trims common prefix/suffix before diffing anyway.
 */
function detailSnapshots(
  before: string,
  after: string,
): Pick<ContextUpdateDetail, "before" | "after" | "trimmed"> {
  const a = toLines(before)
  const b = toLines(after)
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++
  }
  const leading = Math.max(0, prefix - DETAIL_CONTEXT_LINES)
  const trailing = Math.max(0, suffix - DETAIL_CONTEXT_LINES)
  if (leading === 0 && trailing === 0) return { before, after }
  return {
    before: a.slice(leading, a.length - trailing).join("\n"),
    after: b.slice(leading, b.length - trailing).join("\n"),
    trimmed: { leading, trailing },
  }
}

export const updateContextTool: AgentTool = {
  name: "update_context",
  description:
    "Write to one of the agent's context files (schemas.md, conventions.md, feedback.md). " +
    "Call this the moment you learn something durable — without waiting to be asked: a clarified " +
    "schema fact or value set, a project convention, a user correction, a data-quality quirk, or an " +
    "error pattern from running SQL. Saving is cheap and git-tracked; prefer over-saving to losing a " +
    "finding. Prefer 'append' for new findings; " +
    "use 'replace' only when restructuring an entire file. " +
    "Writes are scoped to the data source bound to this chat; with no connection bound they go to " +
    "the workspace-level (unassigned) docs.",
  input_schema: {
    type: "object",
    required: ["file", "mode", "content"],
    properties: {
      file: {
        type: "string",
        enum: [...CONTEXT_FILES],
        description:
          "schemas.md = table/column facts; conventions.md = how the team writes SQL / what business terms mean; feedback.md = corrections and run_sql errors and what was learned.",
      },
      mode: {
        type: "string",
        enum: ["append", "replace"],
      },
      content: {
        type: "string",
        description:
          "Markdown to append (added under a dated heading) or replace the whole file with.",
      },
    },
  },
  async execute(rawInput, ctx) {
    const input = (rawInput ?? {}) as Input
    const bound = ctx.session.meta.connectionId
    const connectionId = bound && isSafeConnectionId(bound) ? bound : null
    if (typeof input.file !== "string" || !isContextFile(input.file)) {
      return {
        toolResult: `Invalid file: must be one of ${CONTEXT_FILES.join(", ")}`,
        isError: true,
        uiSummary: "update_context: invalid file",
      }
    }
    if (input.mode !== "append" && input.mode !== "replace") {
      return {
        toolResult: "Invalid mode: must be 'append' or 'replace'",
        isError: true,
        uiSummary: "update_context: invalid mode",
      }
    }
    if (typeof input.content !== "string" || input.content.trim() === "") {
      return {
        toolResult: "Invalid content: must be non-empty string",
        isError: true,
        uiSummary: "update_context: empty content",
      }
    }

    const target = paths.contextFile(input.file, connectionId)
    let current = ""
    try {
      current = await fs.readFile(target, "utf8")
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
    let next: string
    if (input.mode === "replace") {
      next = input.content.endsWith("\n") ? input.content : input.content + "\n"
    } else {
      const stamp = new Date().toISOString().slice(0, 10)
      const block = `## ${stamp}\n\n${input.content.trim()}\n`
      next = current === "" ? block : current.replace(/\n*$/, "\n\n") + block
    }
    await writeAtomic(target, next)
    return {
      toolResult: `Wrote ${next.length} bytes to context/${input.file}.md (${input.mode})`,
      isError: false,
      uiSummary: `Updated context/${input.file}.md (${input.mode})`,
      detail: { file: `${input.file}.md`, mode: input.mode, ...detailSnapshots(current, next) },
    }
  },
}
