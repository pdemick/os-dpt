export type MenuKind =
  | "table"
  | "column"
  | "function"
  | "operator"
  | "snippet"

export interface MenuEntry {
  kind: MenuKind
  /** Shown in the row + drives fuzzy filtering. */
  label: string
  /**
   * Text written to the document on accept. May contain `$|` once to
   * mark the desired cursor position; the marker is stripped on insert.
   */
  insert: string
  /** Muted right-aligned secondary text. */
  detail?: string
  /** Only set for columns — used as a badge ("of users"). */
  table?: string
}

/**
 * Resolve an insert template: strip the `$|` cursor marker, returning
 * the text to insert and the offset (within the inserted text) where the
 * cursor should land. With no marker, the cursor lands at the end.
 */
export function resolveInsert(insert: string): {
  text: string
  cursorOffset: number
} {
  const marker = "$|"
  const idx = insert.indexOf(marker)
  if (idx === -1) return { text: insert, cursorOffset: insert.length }
  return {
    text: insert.slice(0, idx) + insert.slice(idx + marker.length),
    cursorOffset: idx,
  }
}

/** Last dot-separated segment, used for prefix-ranking. */
export function entryLeaf(entry: MenuEntry): string {
  const parts = entry.label.split(".")
  return parts[parts.length - 1] || entry.label
}
