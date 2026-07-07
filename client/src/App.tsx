import type * as React from "react"
import { useCallback, useState } from "react"

import { AppSidebar, type View } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/CommandPalette"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Chat } from "@/views/Chat"
import { Connections } from "@/views/Connections"
import { Documentation } from "@/views/Documentation"
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

  const selectView = useCallback((v: View) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }, [])

  const Active = views[view]

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
