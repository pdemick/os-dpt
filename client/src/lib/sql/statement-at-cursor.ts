// Find the SQL statement boundaries containing `cursor`, splitting on
// top-level semicolons. Strings, line comments, block comments, and
// PostgreSQL dollar-quoted strings are skipped over.
//
// If the cursor sits between statements (on trailing whitespace or
// inside the trailing newline after a `;`), returns the *next*
// statement; falls back to the previous one if there is no next.
//
// Returned indices are trimmed to non-whitespace content; if the
// containing region is whitespace-only, returns null.
export function statementAtCursor(
  doc: string,
  cursor: number,
): { from: number; to: number; sql: string } | null {
  const boundaries = topLevelSemicolons(doc)
  // Build segments: [0..b0], [b0+1..b1], …, [bn+1..len]
  const segments: { from: number; to: number }[] = []
  let start = 0
  for (const idx of boundaries) {
    segments.push({ from: start, to: idx })
    start = idx + 1
  }
  segments.push({ from: start, to: doc.length })

  // Pick the segment containing the cursor; prefer the one whose
  // non-whitespace span is non-empty.
  let pick = segments.findIndex((s) => cursor >= s.from && cursor <= s.to)
  if (pick === -1) pick = segments.length - 1

  // If the chosen segment is empty/whitespace, try forward then backward.
  const trim = (seg: { from: number; to: number }) => {
    let f = seg.from
    let t = seg.to
    while (f < t && /\s/.test(doc[f])) f++
    while (t > f && /\s/.test(doc[t - 1])) t--
    return { from: f, to: t }
  }
  for (const offset of [0, 1, -1, 2, -2]) {
    const i = pick + offset
    if (i < 0 || i >= segments.length) continue
    const t = trim(segments[i])
    if (t.to > t.from) return { from: t.from, to: t.to, sql: doc.slice(t.from, t.to) }
  }
  return null
}

function topLevelSemicolons(doc: string): number[] {
  const result: number[] = []
  let i = 0
  const len = doc.length
  while (i < len) {
    const ch = doc[i]
    // Line comment --
    if (ch === "-" && doc[i + 1] === "-") {
      const nl = doc.indexOf("\n", i + 2)
      i = nl === -1 ? len : nl + 1
      continue
    }
    // Block comment /* */ (PostgreSQL nests these)
    if (ch === "/" && doc[i + 1] === "*") {
      i += 2
      let depth = 1
      while (i < len && depth > 0) {
        if (doc[i] === "/" && doc[i + 1] === "*") {
          depth++
          i += 2
        } else if (doc[i] === "*" && doc[i + 1] === "/") {
          depth--
          i += 2
        } else {
          i++
        }
      }
      continue
    }
    // Single-quoted string ' ... ', doubled '' to escape
    if (ch === "'") {
      i++
      while (i < len) {
        if (doc[i] === "'") {
          if (doc[i + 1] === "'") {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }
    // Quoted identifier " ... ", doubled "" to escape
    if (ch === '"') {
      i++
      while (i < len) {
        if (doc[i] === '"') {
          if (doc[i + 1] === '"') {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }
    // Dollar-quoted string  $tag$ ... $tag$  (tag may be empty)
    if (ch === "$") {
      const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(doc.slice(i))
      if (tagMatch) {
        const tag = tagMatch[0]
        const close = doc.indexOf(tag, i + tag.length)
        i = close === -1 ? len : close + tag.length
        continue
      }
    }
    if (ch === ";") {
      result.push(i)
    }
    i++
  }
  return result
}
