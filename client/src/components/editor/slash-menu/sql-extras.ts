import type { MenuEntry } from "./entries"

// Curated baseline of operators, aggregates, and window functions.
// `$|` marks the cursor position after insert; leave it out to land at end.
export const SQL_EXTRAS: MenuEntry[] = [
  // ── Operators / clauses ─────────────────────────────────────────────
  { kind: "operator", label: "IS NULL", insert: "is null", detail: "operator" },
  {
    kind: "operator",
    label: "IS NOT NULL",
    insert: "is not null",
    detail: "operator",
  },
  { kind: "operator", label: "IN", insert: "in ($|)", detail: "operator" },
  {
    kind: "operator",
    label: "NOT IN",
    insert: "not in ($|)",
    detail: "operator",
  },
  {
    kind: "operator",
    label: "BETWEEN",
    insert: "between $| and ",
    detail: "operator",
  },
  {
    kind: "operator",
    label: "LIKE",
    insert: "like '$|%'",
    detail: "operator",
  },
  {
    kind: "operator",
    label: "ILIKE",
    insert: "ilike '$|%'",
    detail: "operator",
  },
  {
    kind: "operator",
    label: "EXISTS",
    insert: "exists ($|)",
    detail: "operator",
  },
  {
    kind: "snippet",
    label: "CASE WHEN … THEN … END",
    insert: "case when $| then  else  end",
    detail: "snippet",
  },
  {
    kind: "snippet",
    label: "COALESCE",
    insert: "coalesce($|, )",
    detail: "snippet",
  },
  {
    kind: "snippet",
    label: "NULLIF",
    insert: "nullif($|, )",
    detail: "snippet",
  },
  // ── Aggregates ─────────────────────────────────────────────────────
  {
    kind: "function",
    label: "COUNT(*)",
    insert: "count(*)",
    detail: "aggregate",
  },
  { kind: "function", label: "COUNT", insert: "count($|)", detail: "aggregate" },
  {
    kind: "function",
    label: "COUNT DISTINCT",
    insert: "count(distinct $|)",
    detail: "aggregate",
  },
  { kind: "function", label: "SUM", insert: "sum($|)", detail: "aggregate" },
  { kind: "function", label: "AVG", insert: "avg($|)", detail: "aggregate" },
  { kind: "function", label: "MIN", insert: "min($|)", detail: "aggregate" },
  { kind: "function", label: "MAX", insert: "max($|)", detail: "aggregate" },
  {
    kind: "function",
    label: "STRING_AGG",
    insert: "string_agg($|, ', ')",
    detail: "aggregate",
  },
  {
    kind: "function",
    label: "ARRAY_AGG",
    insert: "array_agg($|)",
    detail: "aggregate",
  },
  // ── Window functions ───────────────────────────────────────────────
  {
    kind: "function",
    label: "ROW_NUMBER OVER",
    insert: "row_number() over ($|)",
    detail: "window",
  },
  {
    kind: "function",
    label: "RANK OVER",
    insert: "rank() over ($|)",
    detail: "window",
  },
  {
    kind: "function",
    label: "DENSE_RANK OVER",
    insert: "dense_rank() over ($|)",
    detail: "window",
  },
  { kind: "function", label: "LAG", insert: "lag($|)", detail: "window" },
  { kind: "function", label: "LEAD", insert: "lead($|)", detail: "window" },
  {
    kind: "snippet",
    label: "OVER (PARTITION BY …)",
    insert: "over (partition by $| order by )",
    detail: "window",
  },
]
