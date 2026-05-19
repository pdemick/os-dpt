import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { sql, PostgreSQL } from "@codemirror/lang-sql"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorView, keymap } from "@codemirror/view"
import type { SQLNamespace } from "@shared/types"
import { useResolvedTheme } from "@/hooks/use-resolved-theme"

interface Props {
  value: string
  onChange: (value: string) => void
  onCursorChange?: (line: number, ch: number, scrollTop: number) => void
  onSave?: () => void
  /** Called when `/` is pressed at the start of an otherwise-empty line. */
  onSlashTrigger?: () => void
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
  onSlashTrigger,
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
  const onSlashTriggerRef = useRef(onSlashTrigger)
  useLayoutEffect(() => {
    onSaveRef.current = onSave
    onCursorChangeRef.current = onCursorChange
    onSlashTriggerRef.current = onSlashTrigger
  })

  // The selection is applied on mount via CodeMirror's `selection` prop.
  // We compute it from the *initial* value so it stays stable; the parent
  // gives us key={slug} so we get a fresh mount per worksheet tab.
  const [initialSelection] = useState(() =>
    initialCursor
      ? { anchor: cursorToOffset(value, initialCursor.line, initialCursor.ch) }
      : undefined,
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
          key: "/",
          run: (view) => {
            const handler = onSlashTriggerRef.current
            if (!handler) return false
            const head = view.state.selection.main.head
            const line = view.state.doc.lineAt(head)
            const before = line.text.slice(0, head - line.from)
            // Only hijack `/` when the user is at the start of a blank
            // line — keeps `/*` comments and `/` division untouched.
            if (before.trim() !== "") return false
            handler()
            return true
          },
        },
      ]),
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
    [schema],
  )

  useEffect(() => {
    const view = ref.current?.view
    if (view && initialScrollTop != null) {
      view.scrollDOM.scrollTop = initialScrollTop
    }
    // intentional: only first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        autocompletion: true,
        foldGutter: true,
      }}
      height="100%"
      style={{ height: "100%", fontSize: 13 }}
    />
  )
}
