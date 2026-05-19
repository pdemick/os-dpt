import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWorksheets } from "@/hooks/use-worksheets"

export function StatusBar() {
  const { session, dirty, refreshSchema } = useWorksheets()
  const active = session.activeSlug
  const tab = active ? session.openTabs.find((t) => t.slug === active) : null
  return (
    <div className="flex h-7 items-center justify-between border-t border-sidebar-border bg-sidebar px-2 font-mono text-[11px] text-sidebar-foreground/70">
      <div className="flex items-center gap-3 px-1">
        <span>no connection</span>
        {active && (
          <>
            <span>•</span>
            <span>{active}</span>
            {dirty(active) && <span className="text-orange-500">• unsaved</span>}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {tab && (
          <span className="px-1">
            Ln {tab.cursor.line + 1}, Col {tab.cursor.ch + 1}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void refreshSchema()}
          className="h-5 gap-1 px-1.5 text-[11px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <RefreshCw className="size-3" />
          schema
        </Button>
      </div>
    </div>
  )
}
