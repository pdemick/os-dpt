import CodeMirror from "@uiw/react-codemirror"
import { sql, PostgreSQL } from "@codemirror/lang-sql"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorView } from "@codemirror/view"

import { useResolvedTheme } from "@/hooks/use-resolved-theme"

const extensions = [
  sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
  EditorView.lineWrapping,
]

/**
 * Read-only, syntax-highlighted SQL block for compact surfaces (chat tool
 * rows, chart source queries). Same dialect/theme stack as the worksheet
 * editor, minus all editing chrome.
 */
export function SqlPreview({ value }: { value: string }) {
  const theme = useResolvedTheme()
  return (
    <div className="overflow-hidden rounded border border-border/60 text-[11px]">
      <CodeMirror
        value={value}
        editable={false}
        readOnly
        extensions={extensions}
        theme={theme === "dark" ? oneDark : "light"}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          highlightSelectionMatches: false,
        }}
        maxHeight="15rem"
        style={{ fontSize: 11 }}
      />
    </div>
  )
}
