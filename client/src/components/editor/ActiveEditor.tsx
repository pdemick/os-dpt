import { useWorksheets } from "@/hooks/use-worksheets"
import { CodeMirrorEditor } from "./CodeMirrorEditor"

export function ActiveEditor() {
  const { session, files, schema, updateBuffer, updateCursor, save } = useWorksheets()
  const slug = session.activeSlug
  if (!slug) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Open a worksheet from the sidebar, or create a new one.
      </div>
    )
  }
  const file = files[slug]
  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading {slug}…
      </div>
    )
  }
  const tab = session.openTabs.find((t) => t.slug === slug)
  return (
    <div className="flex-1 min-h-0">
      <CodeMirrorEditor
        key={slug}
        value={file.buffer}
        onChange={(v) => updateBuffer(slug, v)}
        onCursorChange={(line, ch, scrollTop) => updateCursor(slug, { line, ch }, scrollTop)}
        onSave={() => void save(slug)}
        schema={schema}
        initialCursor={tab?.cursor}
        initialScrollTop={tab?.scrollTop}
      />
    </div>
  )
}
