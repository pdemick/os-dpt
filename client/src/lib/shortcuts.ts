// Small keyboard-shortcut helper shared by the command palette and search menu.
// "mod" is the platform accelerator: ⌘ on macOS, Ctrl elsewhere. We accept
// either Meta or Ctrl at match time so the same binding works cross-platform.

export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform)

export interface Shortcut {
  /** Single key, matched case-insensitively (e.g. "c", ","). */
  key: string
  /** Requires ⌘ (macOS) / Ctrl (elsewhere). */
  mod?: boolean
  shift?: boolean
}

export function matchesShortcut(e: KeyboardEvent, s: Shortcut): boolean {
  const mod = e.metaKey || e.ctrlKey
  if (!!s.mod !== mod) return false
  if (!!s.shift !== e.shiftKey) return false
  if (e.altKey) return false
  return e.key.toLowerCase() === s.key.toLowerCase()
}

export function formatShortcut(s: Shortcut): string {
  const parts: string[] = []
  if (s.mod) parts.push(IS_MAC ? "⌘" : "Ctrl")
  if (s.shift) parts.push(IS_MAC ? "⇧" : "Shift")
  parts.push(s.key === "," ? "," : s.key.toUpperCase())
  return parts.join(IS_MAC ? "" : "+")
}
