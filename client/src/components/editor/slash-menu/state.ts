import { StateEffect, StateField } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

export interface MenuState {
  /**
   * Doc position where the trigger started.
   * - `hasSlash: true` → position of the `/` character.
   * - `hasSlash: false` → first character of the identifier word.
   */
  startPos: number
  /** Distinguishes `/`-triggered (skip the slash in filter) from typing-triggered. */
  hasSlash: boolean
  /** Index into the *currently filtered* match list. */
  selectedIndex: number
}

/** Open the menu, replace its state, or close it (with `null`). */
export const setMenuState = StateEffect.define<MenuState | null>()

// Closes itself if the doc range from `startPos` to the cursor ever stops
// looking valid for the active mode:
//   slash mode → `/<word-chars>`
//   typing mode → one-or-more word chars
// Covers backspacing past the trigger, typing a space/comma, moving the
// cursor away, or selecting a range.
export const menuField = StateField.define<MenuState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMenuState)) return e.value
    }
    if (value === null) return null
    if (!tr.docChanged && !tr.selection) return value
    const sel = tr.state.selection.main
    if (!sel.empty) return null
    const head = sel.head
    if (head < value.startPos) return null
    const text = tr.state.doc.sliceString(value.startPos, head)
    if (value.hasSlash) {
      if (!/^\/\w*$/.test(text)) return null
    } else {
      // \w* (not \w+) so the menu can stay open at an anchor position
      // before the user has typed any filter chars.
      if (!/^\w*$/.test(text)) return null
    }
    return value
  },
})

/** Text the user has typed since the trigger (the filter feed). */
export function readFilter(view: EditorView, menu: MenuState): string {
  return view.state.doc.sliceString(
    menu.hasSlash ? menu.startPos + 1 : menu.startPos,
    view.state.selection.main.head,
  )
}
