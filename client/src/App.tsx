import type * as React from "react"
import { useCallback, useEffect, useState } from "react"

import { AppSidebar, type View } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/CommandPalette"
import { Onboarding } from "@/components/onboarding"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { api } from "@/lib/api"
import { AgentChatProvider } from "@/lib/agent/context"
import { DashboardsProvider } from "@/lib/dashboards/store"
import { WorksheetsProvider } from "@/lib/worksheets/context"
import { Chat } from "@/views/Chat"
import { Connections } from "@/views/Connections"
import { Dashboards } from "@/views/Dashboards"
import { Documentation } from "@/views/Documentation"
import { Settings } from "@/views/Settings"
import { Worksheets } from "@/views/Worksheets"

const views: Record<View, React.ComponentType> = {
  worksheets: Worksheets,
  dashboards: Dashboards,
  connections: Connections,
  chat: Chat,
  documentation: Documentation,
  settings: Settings,
}

const VIEW_KEY = "os-dpt:view"

export function App() {
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem(VIEW_KEY)
    return saved && saved in views ? (saved as View) : "worksheets"
  })

  // null = still checking (the normal shell renders optimistically rather than
  // blocking first paint on the requests); true = fresh workspace. A workspace
  // counts as fresh only when it has no connections AND no configured AI
  // provider — a configured key means the user has been here before (e.g. they
  // deleted their last connection), and re-running setup would be noise.
  // "Skip for now" only clears it for this page load, so the setup screen
  // returns on reload while the workspace is still fresh.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    void Promise.all([api.listConnections(), api.listAIProviders()]).then(
      ([connections, providers]) => {
        // A failed fetch counts as "not fresh" so errors fall through to the
        // normal shell instead of trapping the user in onboarding.
        const noConnections =
          connections.ok && connections.data.connections.length === 0
        const noConfiguredProviders =
          providers.ok && providers.data.providers.every((p) => !p.configured)
        setShowOnboarding(noConnections && noConfiguredProviders)
      },
    )
  }, [])

  const selectView = useCallback((v: View) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }, [])

  const Active = views[view]

  if (showOnboarding) {
    return <Onboarding onFinished={() => setShowOnboarding(false)} />
  }

  // The worksheets, dashboards, and standalone-chat providers live at the
  // shell so the sidebar's submenus and their views share one source of list
  // + selection state — open worksheets and the open conversation also
  // survive view switches. The Worksheets view nests its own worksheet-bound
  // AgentChatProvider, which shadows the standalone one for its subtree.
  return (
    <WorksheetsProvider>
      <DashboardsProvider>
        <AgentChatProvider worksheetSlug={null} standalone>
          <SidebarProvider>
            <AppSidebar view={view} onSelect={selectView} variant="floating" />
            <SidebarInset>
              <div className="flex min-h-0 flex-1 flex-col">
                <Active />
              </div>
            </SidebarInset>
            <CommandPalette onNavigate={selectView} />
          </SidebarProvider>
        </AgentChatProvider>
      </DashboardsProvider>
    </WorksheetsProvider>
  )
}

export default App
