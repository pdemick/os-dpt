import { format } from "sql-formatter"

// Project house style: PostgreSQL dialect, lowercase keywords, leading
// commas, two-space indent. Keep this single source of truth so the
// command palette and any future format-on-save use identical output.
export function formatSql(sql: string): string {
  const base = format(sql, {
    language: "postgresql",
    keywordCase: "lower",
    identifierCase: "preserve",
    dataTypeCase: "lower",
    functionCase: "lower",
    indentStyle: "standard",
    logicalOperatorNewline: "before",
    expressionWidth: 80,
    tabWidth: 2,
    useTabs: false,
  })
  return collapseShortClauses(moveTrailingCommasToLeading(base))
}

// sql-formatter v15 dropped its `commaPosition` option, so we
// post-process: for any line ending with `,` (after trimming whitespace),
// strip the comma and prepend it to the next non-blank line, preserving
// that line's indentation. Skips lines whose comma is inside a string
// literal (best-effort: balanced single quotes per line).
function moveTrailingCommasToLeading(text: string): string {
  const lines = text.split("\n")
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i]
    const rstripped = line.replace(/\s+$/, "")
    if (!rstripped.endsWith(",")) continue
    if (countUnescapedQuotes(rstripped) % 2 !== 0) continue
    let j = i + 1
    while (j < lines.length && lines[j].trim() === "") j += 1
    if (j >= lines.length) continue
    lines[i] = rstripped.slice(0, -1).replace(/\s+$/, "")
    const next = lines[j]
    const indent = next.match(/^[ \t]*/)?.[0] ?? ""
    lines[j] = `${indent}, ${next.slice(indent.length)}`
  }
  return lines.join("\n")
}

// sql-formatter v15 always breaks after each clause keyword. When the
// clause has exactly one short continuation line, collapse it back onto
// the keyword line: `from\n  visitor_stats` → `from visitor_stats`.
// Multi-line clauses (multi-column ORDER BY, AND-chained WHERE) keep
// their existing layout because the "next-next line" test fails.
const COLLAPSIBLE_CLAUSES = new Set([
  "from",
  "where",
  "having",
  "limit",
  "offset",
  "fetch",
  "set",
  "group by",
  "order by",
  "partition by",
  "on",
  "using",
])

function collapseShortClauses(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()
    const next = lines[i + 1]
    const afterNext = lines[i + 2]
    if (
      next != null &&
      COLLAPSIBLE_CLAUSES.has(trimmed.toLowerCase()) &&
      next.trim() !== ""
    ) {
      const keywordIndent = leadingWhitespace(line).length
      const nextIndent = leadingWhitespace(next).length
      const afterIndent =
        afterNext == null || afterNext.trim() === ""
          ? -1
          : leadingWhitespace(afterNext).length
      // Continuation must be deeper, and the line *after* must outdent back
      // to the keyword level (or beyond) — otherwise the clause has more
      // than one line of body and we leave the layout alone.
      if (
        nextIndent > keywordIndent &&
        (afterIndent === -1 || afterIndent <= keywordIndent)
      ) {
        out.push(`${" ".repeat(keywordIndent)}${trimmed} ${next.trim()}`)
        i += 1
        continue
      }
    }
    out.push(line)
  }
  return out.join("\n")
}

function leadingWhitespace(line: string): string {
  return line.match(/^[ \t]*/)?.[0] ?? ""
}

function countUnescapedQuotes(line: string): number {
  let count = 0
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== "'") continue
    // SQL escapes single quotes by doubling them; skip the pair.
    if (line[i + 1] === "'") {
      i += 1
      continue
    }
    count += 1
  }
  return count
}
