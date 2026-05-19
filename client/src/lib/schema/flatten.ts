import type { SQLNamespace } from "@shared/types"

export interface SchemaEntry {
  /** "table" or "table.column" — what the user sees and what insert uses. */
  qualified: string
  kind: "table" | "column"
  /** Just the leaf name, for fuzzy ranking. */
  leaf: string
  /** Path to the table the column belongs to (undefined for tables). */
  table?: string
}

// Walks the recursive SQLNamespace into a flat list of tables and columns.
// SQLNamespace is one of:
//   - { [name]: SQLNamespace }
//   - string[]            (column names under a table)
//   - { self: { label }, children: SQLNamespace }
// We flatten with dot-joined paths (schema.table.column) so the palette can
// match against the qualified name.
export function flattenSchema(schema: SQLNamespace, prefix = ""): SchemaEntry[] {
  const out: SchemaEntry[] = []
  walk(schema, prefix, out)
  return out
}

function walk(node: SQLNamespace, prefix: string, out: SchemaEntry[]): void {
  if (Array.isArray(node)) {
    // Bare column-name list — `prefix` is the table.
    for (const col of node) {
      out.push({
        qualified: prefix ? `${prefix}.${col}` : col,
        kind: "column",
        leaf: col,
        table: prefix || undefined,
      })
    }
    return
  }
  if (node && typeof node === "object" && "self" in node && "children" in node) {
    const label = (node as { self: { label: string } }).self.label
    const next = prefix ? `${prefix}.${label}` : label
    walk((node as { children: SQLNamespace }).children, next, out)
    return
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node as Record<string, SQLNamespace>)) {
      const next = prefix ? `${prefix}.${key}` : key
      // A node whose value is an array of strings is a table; emit it as
      // a table entry and recurse to capture its columns.
      if (Array.isArray(child)) {
        out.push({ qualified: next, kind: "table", leaf: key })
      }
      walk(child, next, out)
    }
  }
}
