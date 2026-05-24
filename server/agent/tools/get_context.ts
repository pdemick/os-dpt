import { promises as fs } from "node:fs"

import { CONTEXT_FILES, type ContextFile, isSafeConnectionId, paths } from "../../workspace.ts"

import type { AgentTool } from "./index.ts"

interface Input {
  files?: ContextFile[]
}

async function readOne(file: ContextFile, connectionId: string | null): Promise<string | null> {
  try {
    return await fs.readFile(paths.contextFile(file, connectionId), "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null
    throw err
  }
}

export const getContextTool: AgentTool = {
  name: "get_context",
  description:
    "Read the agent's persisted context (markdown files in the workspace's context/ directory). " +
    "These contain prior learnings about schemas, project conventions, and user feedback. " +
    "Context is scoped to the data source bound to this chat; if no connection is bound, the " +
    "workspace-level (unassigned) docs are read instead. " +
    "Call this near the start of a session and any time you might be missing context for a request.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description:
          "Subset of context files to read. Defaults to all files when omitted.",
        items: { type: "string", enum: [...CONTEXT_FILES] },
      },
    },
  },
  async execute(rawInput, ctx) {
    const input = (rawInput ?? {}) as Input
    const bound = ctx.session.meta.connectionId
    const connectionId = bound && isSafeConnectionId(bound) ? bound : null
    const requested =
      input.files && input.files.length > 0 ? input.files : [...CONTEXT_FILES]
    const sections: string[] = []
    let present = 0
    for (const f of requested) {
      const body = await readOne(f, connectionId)
      if (body === null) {
        sections.push(`## ${f}.md\n(not yet written)`)
      } else {
        present += 1
        sections.push(`## ${f}.md\n${body.trim()}`)
      }
    }
    return {
      toolResult: sections.join("\n\n"),
      isError: false,
      uiSummary: `Read ${present}/${requested.length} context files`,
    }
  },
}
