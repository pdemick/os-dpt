import { useCallback, type ReactNode } from "react"

import { WorksheetsProvider } from "@/lib/worksheets/context"
import { AgentChatProvider } from "@/lib/agent/context"
import { useAppIntent } from "@/lib/app-intents"
import { useWorksheets } from "@/hooks/use-worksheets"
import { WorksheetSidebar } from "@/components/editor/WorksheetSidebar"
import { WorksheetTabs } from "@/components/editor/WorksheetTabs"
import { ActiveEditor } from "@/components/editor/ActiveEditor"
import { StatusBar } from "@/components/editor/StatusBar"
import { ChatPanel } from "@/components/agent/ChatPanel"
import { SearchMenu } from "@/components/SearchMenu"
import { EditorWithResults } from "@/components/editor/EditorWithResults"

// Bridges the worksheet editor's live bindings into the agent provider: new
// chats bind to the active worksheet, and staged SQL flows into its buffer.
function WorksheetChatProvider({ children }: { children: ReactNode }) {
  const { session, updateBuffer } = useWorksheets()
  return (
    <AgentChatProvider
      worksheetSlug={session.activeSlug}
      onSqlWritten={updateBuffer}
    >
      {children}
    </AgentChatProvider>
  )
}

// Runs the "New editor" quick action (creates + opens a fresh worksheet) once
// this view is mounted, so the action works from any view via the intent bus.
function WorksheetIntents() {
  const { createWorksheet } = useWorksheets()
  useAppIntent(
    "new-editor",
    useCallback(() => void createWorksheet(), [createWorksheet])
  )
  return null
}

export function Worksheets() {
  return (
    <WorksheetsProvider>
      <WorksheetChatProvider>
        <WorksheetIntents />
        <div className="flex min-h-0 w-full flex-1">
          <aside className="w-64 shrink-0 border-r border-sidebar-border">
            <WorksheetSidebar />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <WorksheetTabs />
            <EditorWithResults editor={<ActiveEditor />} />
            <StatusBar />
          </div>
          <ChatPanel />
        </div>
        <SearchMenu />
      </WorksheetChatProvider>
    </WorksheetsProvider>
  )
}
