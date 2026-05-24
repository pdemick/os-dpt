import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { sql, PostgreSQL } from "@codemirror/lang-sql"
import { Prec } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorView, keymap } from "@codemirror/view"
import type { SQLNamespace } from "@shared/types"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"
import { onInsertAtCursor } from "@/lib/editor-bus"
import { statementAtCursor } from "@/lib/sql/statement-at-cursor"

interface Props {
  value: string
  onChange: (value: string) => void
  onCursorChange?: (line: number, ch: number, scrollTop: number) => void
  onSave?: () => void
  /** Called with the SQL to execute: the current selection if non-empty, otherwise the statement at the cursor. */
  onExecute?: (sql: string) => void
  schema: SQLNamespace
  initialCursor?: { line: number; ch: number }
  initialScrollTop?: number
}

function cursorToOffset(value: string, line: number, ch: number): number {
  const lines = value.split("\n")
  const safeLine = Math.max(0, Math.min(lines.length - 1, line))
  let offset = 0
  for (let i = 0; i < safeLine; i++) offset += lines[i].length + 1
  return offset + Math.max(0, Math.min(lines[safeLine].length, ch))
}

export function CodeMirrorEditor({
  value,
  onChange,
  onCursorChange,
  onSave,
  onExecute,
  schema,
  initialCursor,
  initialScrollTop,
}: Props) {
  const theme = useResolvedTheme()
  const ref = useRef<ReactCodeMirrorRef>(null)

  // Callbacks come in as fresh closures every parent render; route them through
  // refs so the `extensions` memo only invalidates when `schema` actually changes.
  const onSaveRef = useRef(onSave)
  const onCursorChangeRef = useRef(onCursorChange)
  const onExecuteRef = useRef(onExecute)
  useLayoutEffect(() => {
    onSaveRef.current = onSave
    onCursorChangeRef.current = onCursorChange
    onExecuteRef.current = onExecute
  })

  // The selection is applied on mount via CodeMirror's `selection` prop.
  // We compute it from the *initial* value so it stays stable; the parent
  // gives us key={slug} so we get a fresh mount per worksheet tab.
  const [initialSelection] = useState(() =>
    initialCursor
      ? { anchor: cursorToOffset(value, initialCursor.line, initialCursor.ch) }
      : undefined
  )

  const extensions = useMemo(
    () => [
      sql({
        dialect: PostgreSQL,
        schema: schema as SQLNamespace,
        defaultSchema: "public",
        upperCaseKeywords: true,
      }),
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSaveRef.current?.()
              return true
            },
          },
          {
            key: "Mod-Enter",
            preventDefault: true,
            run: (view) => {
              const onExec = onExecuteRef.current
              if (!onExec) return true
              const sel = view.state.selection.main
              const doc = view.state.doc.toString()
              if (!sel.empty) {
                const sql = doc.slice(sel.from, sel.to).trim()
                if (sql) onExec(sql)
                return true
              }
              const stmt = statementAtCursor(doc, sel.head)
              if (stmt) onExec(stmt.sql)
              return true
            },
          },
        ])
      ),
      EditorView.updateListener.of((u) => {
        const cb = onCursorChangeRef.current
        if (!cb) return
        if (u.selectionSet || u.docChanged || u.geometryChanged) {
          const head = u.state.selection.main.head
          const lineObj = u.state.doc.lineAt(head)
          const line = lineObj.number - 1
          const ch = head - lineObj.from
          const scrollTop = u.view.scrollDOM.scrollTop
          cb(line, ch, scrollTop)
        }
      }),
    ],
    [schema]
  )

  useEffect(() => {
    const view = ref.current?.view
    if (view && initialScrollTop != null) {
      view.scrollDOM.scrollTop = initialScrollTop
    }
    // intentional: only first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for external insertion requests (command palette etc.).
  useEffect(() => {
    return onInsertAtCursor((text) => {
      const view = ref.current?.view
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      })
      view.focus()
    })
  }, [])

  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={theme === "dark" ? oneDark : "light"}
      selection={initialSelection}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        closeBrackets: true,
        // Built-in schema-aware completion (driven by the sql({ schema })
        // extension above) handles identifier autocomplete as you type.
        autocompletion: true,
        foldGutter: true,
      }}
      height="100%"
      style={{ height: "100%", fontSize: 13 }}
    />
  )
}
