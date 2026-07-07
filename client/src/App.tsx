import type * as React from "react"
import { useCallback, useEffect, useState } from "react"

import { AppSidebar, type View } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/CommandPalette"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { api } from "@/lib/api"
import { Chat } from "@/views/Chat"
import { Connections } from "@/views/Connections"
import { Documentation } from "@/views/Documentation"
import { Onboarding } from "@/views/Onboarding"
import { Settings } from "@/views/Settings"
import { Worksheets } from "@/views/Worksheets"

const views: Record<View, React.ComponentType> = {
  worksheets: Worksheets,
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
  // blocking first paint on the request); true = fresh workspace with no
  // connections yet. "Skip for now" only clears it for this page load, so the
  // setup screen returns on reload until a first connection exists.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    void api.listConnections().then((result) => {
      setShowOnboarding(result.ok ? result.data.connections.length === 0 : false)
    })
  }, [])

  const selectView = useCallback((v: View) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }, [])

  const Active = views[view]

  if (showOnboarding) {
    return <Onboarding onFinished={() => setShowOnboarding(false)} />
  }

  return (
    <SidebarProvider>
      <AppSidebar view={view} onSelect={selectView} variant="floating" />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col">
          <Active />
        </div>
      </SidebarInset>
      <CommandPalette onNavigate={selectView} />
    </SidebarProvider>
  )
}

export default App
