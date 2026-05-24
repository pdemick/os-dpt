import { useMemo } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { Prec } from "@codemirror/state"
import { oneDark } from "@codemirror/theme-one-dark"
import { EditorView, keymap } from "@codemirror/view"

import { useResolvedTheme } from "@/hooks/use-resolved-theme"

interface Props {
  value: string
  onChange: (value: string) => void
  onSave?: () => void
}

/** Plain-text markdown editor. No language extension — Streamdown owns the
 *  rendered view; here we just want comfortable wrapped editing + Cmd/Ctrl+S. */
export function MarkdownEditor({ value, onChange, onSave }: Props) {
  const theme = useResolvedTheme()

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave?.()
              return true
            },
          },
        ]),
      ),
    ],
    [onSave],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={theme === "dark" ? oneDark : "light"}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        foldGutter: false,
        autocompletion: false,
      }}
      height="100%"
      style={{ height: "100%", fontSize: 13 }}
    />
  )
}
