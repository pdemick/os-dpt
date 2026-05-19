import { useEffect, useRef } from "react"
import { MergeView } from "@codemirror/merge"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { sql, PostgreSQL } from "@codemirror/lang-sql"
import { oneDark } from "@codemirror/theme-one-dark"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"

interface Props {
  /** Older content (left side) */
  past: string
  /** Newer content (right side, e.g. current buffer) */
  current: string
}

export function DiffView({ past, current }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const merge = useRef<MergeView | null>(null)
  // Compartments let us swap the theme extension without rebuilding the view.
  const themeCompartments = useRef<{ a: Compartment; b: Compartment } | null>(null)
  const theme = useResolvedTheme()

  // Build the MergeView once on mount; reconfigure docs/theme via dispatch.
  useEffect(() => {
    if (!host.current) return
    const themeA = new Compartment()
    const themeB = new Compartment()
    themeCompartments.current = { a: themeA, b: themeB }
    const baseExtensions = [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
    ]
    const view = new MergeView({
      a: { doc: past, extensions: [...baseExtensions, themeA.of(theme === "dark" ? oneDark : [])] },
      b: { doc: current, extensions: [...baseExtensions, themeB.of(theme === "dark" ? oneDark : [])] },
      parent: host.current,
      revertControls: undefined,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    })
    merge.current = view
    return () => {
      view.destroy()
      merge.current = null
      themeCompartments.current = null
    }
    // Intentionally empty deps: build once. Doc/theme updates handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replace docs when past/current change.
  useEffect(() => {
    const view = merge.current
    if (!view) return
    if (view.a.state.doc.toString() !== past) {
      view.a.dispatch({ changes: { from: 0, to: view.a.state.doc.length, insert: past } })
    }
    if (view.b.state.doc.toString() !== current) {
      view.b.dispatch({ changes: { from: 0, to: view.b.state.doc.length, insert: current } })
    }
  }, [past, current])

  // Swap the theme extension via Compartment reconfigure.
  useEffect(() => {
    const view = merge.current
    const compartments = themeCompartments.current
    if (!view || !compartments) return
    const ext = theme === "dark" ? oneDark : []
    view.a.dispatch({ effects: compartments.a.reconfigure(ext) })
    view.b.dispatch({ effects: compartments.b.reconfigure(ext) })
  }, [theme])

  return <div ref={host} className="h-full w-full overflow-auto text-xs" />
}
