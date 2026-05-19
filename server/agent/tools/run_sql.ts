import { getPool } from "../../db/registry.ts"
import { normalizePgError } from "../../db/postgres.ts"

import type { AgentTool } from "./index.ts"

interface Input {
  sql?: string
  connection_id?: string
  row_limit?: number
}

const DEFAULT_ROW_LIMIT = 50
const MAX_ROW_LIMIT = 500
const MAX_RESULT_CHARS = 16_000

function format(rows: unknown[], columns: string[], rowCount: number | null): string {
  const header = `columns: ${columns.join(", ")}\nrowCount: ${rowCount ?? rows.length}\n`
  const body = rows.map((r) => JSON.stringify(r)).join("\n")
  let out = header + (body ? `rows:\n${body}` : "(no rows)")
  if (out.length > MAX_RESULT_CHARS) {
    out = out.slice(0, MAX_RESULT_CHARS) + "\n…(truncated)"
  }
  return out
}

export const runSqlTool: AgentTool = {
  name: "run_sql",
  description:
    "Execute SQL against the active database connection and return the result. Use this to validate " +
    "queries you've written and to inspect data. If the query errors, capture what you learned by calling " +
    "update_context against feedback.md so future runs avoid the same mistake. " +
    "Row results are capped (default 50, max 500) — add LIMIT or aggregation if you need a wider view. " +
    "IMPORTANT: this tool executes the SQL verbatim against whatever role the connection uses — including " +
    "DDL (CREATE/DROP/ALTER) and DML (INSERT/UPDATE/DELETE/TRUNCATE). For read-only exploration prefer " +
    "SELECT. Before running anything that mutates data or schema, call ask_user_question to confirm.",
  input_schema: {
    type: "object",
    required: ["sql"],
    properties: {
      sql: { type: "string", description: "SQL to execute." },
      connection_id: {
        type: "string",
        description: "Connection UUID. Defaults to the chat's bound connection.",
      },
      row_limit: {
        type: "number",
        description: `Cap on rows returned to the agent (default ${DEFAULT_ROW_LIMIT}, max ${MAX_ROW_LIMIT}).`,
      },
    },
  },
  async execute(rawInput, ctx) {
    const input = (rawInput ?? {}) as Input
    if (typeof input.sql !== "string" || input.sql.trim() === "") {
      return {
        toolResult: "Invalid sql: must be a non-empty string",
        isError: true,
        uiSummary: "run_sql: empty sql",
      }
    }
    const connId = input.connection_id ?? ctx.session.meta.connectionId
    if (!connId) {
      return {
        toolResult:
          "No connection bound. Ask the user which connection to use, or set connection_id.",
        isError: true,
        uiSummary: "run_sql: no connection",
      }
    }
    const pool = getPool(connId)
    if (!pool) {
      return {
        toolResult: `Connection not active: ${connId}. The user must connect it before SQL can run.`,
        isError: true,
        uiSummary: "run_sql: connection inactive",
      }
    }
    const cap = Math.min(
      MAX_ROW_LIMIT,
      Math.max(1, Math.floor(input.row_limit ?? DEFAULT_ROW_LIMIT)),
    )
    try {
      const res = await pool.query(input.sql)
      const columns = res.fields.map((f) => f.name)
      const capped = res.rows.slice(0, cap)
      const truncated = res.rows.length > cap
      const note = truncated
        ? `\n(showing ${cap} of ${res.rows.length} rows)`
        : ""
      return {
        toolResult: format(capped, columns, res.rowCount) + note,
        isError: false,
        uiSummary: `Ran SQL: ${columns.length} cols, ${res.rowCount ?? capped.length} rows`,
      }
    } catch (err) {
      const message = normalizePgError(err).message
      return {
        toolResult: `Query failed: ${message}`,
        isError: true,
        uiSummary: `run_sql error: ${message}`,
      }
    }
  },
}
