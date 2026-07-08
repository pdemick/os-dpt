import { useState } from "react"
import { History, MessageSquareText, X } from "lucide-react"
import { useWorksheets } from "@/hooks/use-worksheets"
import { Button } from "@/components/ui/button"
import { useAgent } from "@/lib/agent/context"
import { AgentHistoryPanel } from "@/components/agent/AgentHistoryPanel"
import type { HistorySkipReason } from "@shared/types"
import { CodeMirrorEditor } from "./CodeMirrorEditor"
import { HistoryPanel } from "./HistoryPanel"
import { InlineAgentBox } from "./InlineAgentBox"

export function ActiveEditor() {
  const {
    session,
    files,
    schema,
    updateBuffer,
    updateCursor,
    save,
    applyReverted,
    clearHistoryWarning,
    executeActive,
  } = useWorksheets()
  const { chatsForActive } = useAgent()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [agentsOpen, setAgentsOpen] = useState(false)
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 items-center justify-end gap-1 border-b border-sidebar-border px-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setHistoryOpen(true)}
        >
          <History className="size-3.5" />
          History
        </Button>
        {chatsForActive.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setAgentsOpen(true)}
          >
            <MessageSquareText className="size-3.5" />
            Agents ({chatsForActive.length})
          </Button>
        )}
      </div>
      {file.historyWarning && (
        <HistoryWarningBanner
          reason={file.historyWarning}
          onDismiss={() => clearHistoryWarning(slug)}
        />
      )}
      <div className="relative min-h-0 flex-1">
        <CodeMirrorEditor
          key={slug}
          value={file.buffer}
          onChange={(v) => updateBuffer(slug, v)}
          onCursorChange={(line, ch, scrollTop) => updateCursor(slug, { line, ch }, scrollTop)}
          onSave={() => void save(slug)}
          onExecute={(sql) => void executeActive(sql)}
          schema={schema}
          initialCursor={tab?.cursor}
          initialScrollTop={tab?.scrollTop}
        />
        <InlineAgentBox
          slug={slug}
          connectionId={tab?.connectionId ?? null}
          buffer={file.buffer}
          onSql={updateBuffer}
        />
      </div>
      <HistoryPanel
        slug={slug}
        currentContent={file.buffer}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onReverted={(content) => applyReverted(slug, content)}
      />
      <AgentHistoryPanel slug={slug} open={agentsOpen} onOpenChange={setAgentsOpen} />
    </div>
  )
}

function HistoryWarningBanner({
  reason,
  onDismiss,
}: {
  reason: HistorySkipReason
  onDismiss: () => void
}) {
  const message =
    reason === "oversize"
      ? "This worksheet exceeds the per-entry size cap — recent edits aren't being recorded in version history."
      : "Recent edits weren't recorded in version history."
  return (
    <div className="flex items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-0.5 hover:bg-amber-500/20"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
