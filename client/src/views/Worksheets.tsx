import { WorksheetsProvider } from "@/lib/worksheets/context"
import { AgentChatProvider } from "@/lib/agent/context"
import { WorksheetSidebar } from "@/components/editor/WorksheetSidebar"
import { WorksheetTabs } from "@/components/editor/WorksheetTabs"
import { ActiveEditor } from "@/components/editor/ActiveEditor"
import { StatusBar } from "@/components/editor/StatusBar"
import { ChatPanel } from "@/components/agent/ChatPanel"
import { CommandPalette } from "@/components/CommandPalette"
import { EditorWithResults } from "@/components/editor/EditorWithResults"

export function Worksheets() {
  return (
    <WorksheetsProvider>
      <AgentChatProvider>
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
      </AgentChatProvider>
    </WorksheetsProvider>
  )
}
