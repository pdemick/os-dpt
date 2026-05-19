// Lightweight SQL alias engine for the schema picker.
//
// We don't try to parse SQL — we just regex-scan the active statement
// for FROM/JOIN clauses and harvest table → alias pairs. Good enough to
// drive the two UX behaviours we care about:
//   1. Inserting `users u` instead of `users` when the user accepts a
//      table in FROM/JOIN position.
//   2. Rewriting a column suggestion to `u.email` when its table is in
//      scope under an alias.

export interface FromRef {
  /** As written by the user — possibly qualified (e.g. "public.users"). */
  table: string
  /** Trailing alias, if present. */
  alias: string | null
}

// Words that follow a table name but are NOT aliases. Without this filter,
// `FROM users WHERE …` would record "WHERE" as an alias for "users".
const RESERVED_ALIASES = new Set([
  "where",
  "on",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "lateral",
  "group",
  "order",
  "having",
  "limit",
  "offset",
  "fetch",
  "union",
  "intersect",
  "except",
  "select",
  "from",
  "and",
  "or",
  "as",
  "using",
  "natural",
  "for",
  "window",
  "with",
])

const FROM_JOIN_RE =
  /\b(?:from|join)\s+([A-Za-z_][\w.]*)(?:\s+(?:as\s+)?([A-Za-z_]\w*))?/gi

export function parseFromRefs(sql: string): FromRef[] {
  const refs: FromRef[] = []
  for (const m of sql.matchAll(FROM_JOIN_RE)) {
    const table = m[1]
    let alias: string | null = m[2] ?? null
    if (alias && RESERVED_ALIASES.has(alias.toLowerCase())) alias = null
    refs.push({ table, alias })
  }
  return refs
}

/** Last dot-separated segment, lowercased. */
export function tableLeaf(table: string): string {
  return (table.split(".").pop() ?? table).toLowerCase()
}

/**
 * DBeaver-style alias: first letter of each underscored word
 * (marketing_page_views → mpv); for a single-word table, the first
 * letter. Conflicts resolved by appending an integer.
 */
export function generateAlias(table: string, taken: Set<string>): string {
  const leaf = tableLeaf(table)
  const parts = leaf.split("_").filter(Boolean)
  let base = parts.map((p) => p[0] ?? "").join("")
  if (!base) base = leaf[0] ?? "t"
  if (!taken.has(base)) return base
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}_`
}

/** Set of aliases (and unaliased-table single-letter shorthands) already
 *  in use in the statement — feeds `generateAlias`'s collision check. */
export function takenAliases(refs: FromRef[]): Set<string> {
  const taken = new Set<string>()
  for (const ref of refs) {
    if (ref.alias) taken.add(ref.alias.toLowerCase())
  }
  return taken
}

/** Look up an alias by leaf table name (e.g. `public.users` → "u"). */
export function aliasForTable(
  refs: FromRef[],
  qualifiedTable: string,
): string | null {
  const target = tableLeaf(qualifiedTable)
  for (const ref of refs) {
    if (tableLeaf(ref.table) === target) return ref.alias
  }
  return null
}

/**
 * Reverse of `aliasForTable` — given an identifier the user typed
 * (`fu`, `users`, …), return the qualified table it points at in the
 * current statement. Aliases take priority; bare table-leaf names are
 * a fallback so `users.email` still works without an explicit alias.
 */
export function resolveAliasOrTable(
  refs: FromRef[],
  ident: string,
): string | null {
  const lower = ident.toLowerCase()
  for (const ref of refs) {
    if (ref.alias?.toLowerCase() === lower) return ref.table
  }
  for (const ref of refs) {
    if (tableLeaf(ref.table) === lower) return ref.table
  }
  return null
}

/** True when the menu was opened immediately after `FROM` / `JOIN`. */
export function isInFromOrJoinContext(textBeforeStart: string): boolean {
  return /\b(?:from|join)\s+$/i.test(textBeforeStart)
}

/**
 * Coarse classification of what the user is most likely trying to type:
 *   - `table`      after FROM / JOIN / INTO / UPDATE
 *   - `expression` everywhere else (SELECT list, WHERE, ON, GROUP BY, …)
 *
 * Drives which entry kinds the menu surfaces.
 */
export type MenuContext = "table" | "expression"

const TABLE_POSITION_RE =
  /\b(?:from|join|into|update|table)\s+$/i

export function detectMenuContext(textBeforeStart: string): MenuContext {
  return TABLE_POSITION_RE.test(textBeforeStart) ? "table" : "expression"
}

/**
 * "Anchor positions" — places where it's worth auto-opening the menu
 * with an empty filter (the user clearly intends to write an identifier
 * next). Includes the end of any expression-introducing clause keyword
 * plus list/paren punctuation.
 *
 * Excludes plain `select alias.` style mid-identifier whitespace and
 * one-off spaces in arbitrary positions — we don't want the menu to
 * pop open after every space the user types.
 */
const ANCHOR_RE =
  /(?:\b(?:from|join|into|update|table|where|having|on|using|set|select|by|values|exists)\s+|[,(]\s*)$/i

export function isAtAnchorPosition(textBeforeCursor: string): boolean {
  return ANCHOR_RE.test(textBeforeCursor)
}
