import { Button } from "@/components/ui/button"
import { useWorksheets } from "@/hooks/use-worksheets"

export function RestoreDraftBanner() {
  const { session, files, restoreDraft, discardDraft } = useWorksheets()
  const slug = session.activeSlug
  if (!slug) return null
  const file = files[slug]
  if (!file || file.draftOnDisk == null) return null
  if (file.draftOnDisk === file.content) return null
  if (file.buffer === file.draftOnDisk) {
    // already showing draft contents — let the user discard or keep
    return (
      <div className="flex items-center justify-between border-b bg-amber-500/10 px-3 py-1.5 text-xs">
        <span>Unsaved changes from a previous session are loaded.</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => void discardDraft(slug)}>
            Discard draft
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between border-b bg-amber-500/10 px-3 py-1.5 text-xs">
      <span>This worksheet has an unsaved draft from a previous session.</span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => restoreDraft(slug)}>
          Restore draft
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void discardDraft(slug)}>
          Discard
        </Button>
      </div>
    </div>
  )
}
