import type { Pool } from "pg"

import type { SQLNamespace } from "@shared/types.ts"

const SYSTEM_SCHEMAS = new Set(["information_schema", "pg_catalog", "pg_toast"])

const QUERY = `
  SELECT table_schema, table_name, column_name, ordinal_position
  FROM information_schema.columns
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
    AND table_schema NOT LIKE 'pg_temp_%'
    AND table_schema NOT LIKE 'pg_toast_temp_%'
  ORDER BY table_schema, table_name, ordinal_position
`

interface Row {
  table_schema: string
  table_name: string
  column_name: string
  ordinal_position: number
}

export async function introspect(pool: Pool): Promise<SQLNamespace> {
  const { rows } = await pool.query<Row>(QUERY)

  // Group columns by (schema, table)
  const grouped = new Map<string, Map<string, string[]>>()
  for (const row of rows) {
    if (SYSTEM_SCHEMAS.has(row.table_schema)) continue
    let schema = grouped.get(row.table_schema)
    if (!schema) {
      schema = new Map()
      grouped.set(row.table_schema, schema)
    }
    let cols = schema.get(row.table_name)
    if (!cols) {
      cols = []
      schema.set(row.table_name, cols)
    }
    cols.push(row.column_name)
  }

  const ns: { [name: string]: SQLNamespace } = {}
  for (const [schemaName, tables] of grouped) {
    const tableNs: { [name: string]: SQLNamespace } = {}
    for (const [tableName, cols] of tables) {
      tableNs[tableName] = cols
    }
    if (schemaName === "public") {
      // Hoist public.* to the top level so `users` and `users.id` complete
      // without a schema prefix, while still allowing `public.users`.
      for (const [tableName, cols] of tables) {
        ns[tableName] = cols
      }
    }
    ns[schemaName] = tableNs
  }
  return ns
}
