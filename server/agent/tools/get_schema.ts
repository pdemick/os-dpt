import { getPool } from "../../db/registry.ts"

import type { AgentTool } from "./index.ts"

interface Input {
  connection_id?: string
  schemas?: string[]
  include_columns?: boolean
}

interface SchemaTree {
  [schema: string]: {
    [table: string]: { columns: { name: string; type: string; nullable: boolean }[] }
  }
}

interface RawRow {
  table_schema: string
  table_name: string
  column_name: string
  data_type: string
  is_nullable: "YES" | "NO"
}

// TODO: this cache is module-scoped and never pruned. Bounded by the
// number of distinct (connectionId, schemas) pairs the user touches in
// a process lifetime — fine in practice for a local single-user tool,
// but worth an LRU or stale-eviction pass if memory becomes a concern.
const cache = new Map<string, { at: number; tree: SchemaTree }>()
const TTL_MS = 60_000

function cacheKey(connId: string, schemas: string[]): string {
  return `${connId}::${schemas.slice().sort().join(",")}`
}

async function introspect(
  connId: string,
  schemas: string[],
): Promise<SchemaTree> {
  const pool = getPool(connId)
  if (!pool) throw new Error(`Connection not active: ${connId}`)
  const sql = `
    SELECT table_schema, table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = ANY($1)
    ORDER BY table_schema, table_name, ordinal_position
  `
  const { rows } = await pool.query<RawRow>(sql, [schemas])
  const tree: SchemaTree = {}
  for (const r of rows) {
    const s = (tree[r.table_schema] ??= {})
    const t = (s[r.table_name] ??= { columns: [] })
    t.columns.push({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === "YES",
    })
  }
  return tree
}

function summarize(tree: SchemaTree, includeCols: boolean): string {
  const out: string[] = []
  for (const schema of Object.keys(tree).sort()) {
    out.push(`# ${schema}`)
    for (const table of Object.keys(tree[schema]).sort()) {
      const cols = tree[schema][table].columns
      if (includeCols) {
        out.push(
          `- ${table}(${cols
            .map((c) => `${c.name} ${c.type}${c.nullable ? "" : " NOT NULL"}`)
            .join(", ")})`,
        )
      } else {
        out.push(`- ${table} [${cols.length} cols]`)
      }
    }
  }
  return out.join("\n")
}

export const getSchemaTool: AgentTool = {
  name: "get_schema",
  description:
    "Introspect the live database schema via information_schema. Use this when you need to know " +
    "what tables and columns exist before writing SQL. Results are cached per session for a minute. " +
    "Defaults to the active connection bound to this chat and the 'public' schema.",
  input_schema: {
    type: "object",
    properties: {
      connection_id: {
        type: "string",
        description:
          "Connection UUID to introspect. Defaults to the chat's bound connection.",
      },
      schemas: {
        type: "array",
        items: { type: "string" },
        description: "Postgres schemas to include. Defaults to ['public'].",
      },
      include_columns: {
        type: "boolean",
        description:
          "If true, return column names + types. If false, return only table names with column counts. Defaults to true.",
      },
    },
  },
  async execute(rawInput, ctx) {
    const input = (rawInput ?? {}) as Input
    const connId = input.connection_id ?? ctx.session.meta.connectionId
    if (!connId) {
      return {
        toolResult:
          "No connection bound. Ask the user which connection to use, or set connection_id explicitly.",
        isError: true,
        uiSummary: "get_schema: no connection",
      }
    }
    const schemas =
      input.schemas && input.schemas.length > 0 ? input.schemas : ["public"]
    const includeCols = input.include_columns ?? true
    const key = cacheKey(connId, schemas)
    let entry = cache.get(key)
    if (!entry || Date.now() - entry.at > TTL_MS) {
      try {
        entry = { at: Date.now(), tree: await introspect(connId, schemas) }
        cache.set(key, entry)
      } catch (err) {
        return {
          toolResult: `Schema introspection failed: ${(err as Error).message}`,
          isError: true,
          uiSummary: "get_schema: failed",
        }
      }
    }
    const tableCount = Object.values(entry.tree).reduce(
      (n, s) => n + Object.keys(s).length,
      0,
    )
    return {
      toolResult: summarize(entry.tree, includeCols),
      isError: false,
      uiSummary: `Loaded ${tableCount} tables from ${schemas.join(", ")}`,
    }
  },
}
