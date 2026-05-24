import type { ReactNode } from "react"

import { WorksheetsProvider } from "@/lib/worksheets/context"
import { AgentChatProvider } from "@/lib/agent/context"
import { useWorksheets } from "@/hooks/use-worksheets"
import { WorksheetSidebar } from "@/components/editor/WorksheetSidebar"
import { WorksheetTabs } from "@/components/editor/WorksheetTabs"
import { ActiveEditor } from "@/components/editor/ActiveEditor"
import { StatusBar } from "@/components/editor/StatusBar"
import { ChatPanel } from "@/components/agent/ChatPanel"
import { CommandPalette } from "@/components/CommandPalette"
import { EditorWithResults } from "@/components/editor/EditorWithResults"

// Bridges the worksheet editor's live bindings into the agent provider: new
// chats bind to the active worksheet, and staged SQL flows into its buffer.
function WorksheetChatProvider({ children }: { children: ReactNode }) {
  const { session, updateBuffer } = useWorksheets()
  return (
    <AgentChatProvider worksheetSlug={session.activeSlug} onSqlWritten={updateBuffer}>
      {children}
    </AgentChatProvider>
  )
}

export function Worksheets() {
  return (
    <WorksheetsProvider>
      <WorksheetChatProvider>
        <div className="flex min-h-0 flex-1 w-full">
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
        <CommandPalette />
      </WorksheetChatProvider>
    </WorksheetsProvider>
  )
}
