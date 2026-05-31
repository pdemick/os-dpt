// Statement-level guard for read-only connections.
//
// A read-only connection already opens its pool with
// `default_transaction_read_only=on`, so Postgres itself rejects writes with
// SQLSTATE 25006. But that GUC is a USERSET that a session can turn off
// (`SET default_transaction_read_only=off`), and pg's simple-query protocol
// runs every `;`-separated statement in one round trip — so a single
// `run_sql` call like `SET default_transaction_read_only=off; DELETE ...`
// would slip past the database default. This guard is the defense-in-depth
// layer that closes that hole *before* the SQL reaches the server:
//
//   1. allow only a single statement (no smuggled second statement after a `;`)
//   2. that statement must lead with a read-only keyword
//
// It is intentionally conservative — it can reject an otherwise-fine SELECT
// that contains a literal `;` inside a string. That is an acceptable trade for
// a security default; the user can switch the connection to read-write when
// they actually intend writes. For a hard guarantee independent of any guard,
// connect as a database role that lacks write privileges (see SECURITY.md).

const READ_ONLY_LEADERS = new Set([
  "select",
  "with",
  "table",
  "values",
  "show",
  "explain",
])

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " ") // line comments
}

/**
 * True if `sql` is a single, read-only statement safe to run on a read-only
 * connection. See the module comment for the (deliberate) limitations.
 */
export function isReadOnlyStatement(sql: string): boolean {
  const oneStatement = stripComments(sql)
    .trim()
    .replace(/;\s*$/, "") // a single trailing semicolon is fine
  if (oneStatement === "") return false
  // Anything after a remaining semicolon is a second statement — reject, so a
  // read leader can't be used to smuggle a write (`SELECT 1; DROP TABLE x`).
  if (oneStatement.includes(";")) return false
  const leader = oneStatement.toLowerCase().match(/^[a-z]+/)?.[0]
  if (!leader || !READ_ONLY_LEADERS.has(leader)) return false
  // EXPLAIN is read-only only without ANALYZE, which actually runs the plan.
  if (leader === "explain" && /\banalyze\b/i.test(oneStatement)) return false
  return true
}
