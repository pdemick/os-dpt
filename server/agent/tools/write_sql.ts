import { writeAtomic } from "../../lib/fs-atomic.ts"
import { assertSafeSlug, paths } from "../../workspace.ts"

import type { AgentTool } from "./index.ts"

interface Input {
  sql?: string
  worksheet_slug?: string
}

export const writeSqlTool: AgentTool = {
  name: "write_sql",
  description:
    "Stage SQL into the editor. Writes to the worksheet's draft (autosave channel), so the user " +
    "sees the SQL appear in the editor without losing their saved version until they hit Cmd+S. " +
    "Defaults to the chat's bound worksheet. Pass the COMPLETE worksheet contents — drafts are overwrites, not patches.",
  input_schema: {
    type: "object",
    required: ["sql"],
    properties: {
      sql: {
        type: "string",
        description: "Full SQL text to stage into the worksheet draft.",
      },
      worksheet_slug: {
        type: "string",
        description:
          "Worksheet to write to. Defaults to the chat's bound worksheet.",
      },
    },
  },
  async execute(rawInput, ctx) {
    const input = (rawInput ?? {}) as Input
    if (typeof input.sql !== "string") {
      return {
        toolResult: "Invalid sql: must be a string",
        isError: true,
        uiSummary: "write_sql: invalid sql",
      }
    }
    const slug = input.worksheet_slug ?? ctx.session.meta.worksheetSlug
    if (!slug) {
      return {
        toolResult:
          "No worksheet bound. Ask the user which worksheet to write to, or set worksheet_slug.",
        isError: true,
        uiSummary: "write_sql: no worksheet",
      }
    }
    try {
      assertSafeSlug(slug)
    } catch (err) {
      return {
        toolResult: `Invalid worksheet slug: ${(err as Error).message}`,
        isError: true,
        uiSummary: "write_sql: bad slug",
      }
    }
    await writeAtomic(paths.draft(slug), input.sql)
    return {
      toolResult: `Wrote ${input.sql.length} bytes to draft for worksheet '${slug}'.`,
      isError: false,
      uiSummary: `Staged ${input.sql.length} chars into '${slug}' draft`,
      events: [{ type: "sql_written", worksheetSlug: slug, sql: input.sql }],
    }
  },
}
