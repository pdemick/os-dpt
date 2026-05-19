import type * as React from "react"
import { useState } from "react"

import { AppSidebar, type View } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Connections } from "@/views/Connections"
import { Settings } from "@/views/Settings"
import { Worksheets } from "@/views/Worksheets"

const views: Record<View, React.ComponentType> = {
  worksheets: Worksheets,
  connections: Connections,
  settings: Settings,
}

export function App() {
  const [view, setView] = useState<View>("worksheets")
  const Active = views[view]

  return (
    <SidebarProvider>
      <AppSidebar view={view} onSelect={setView} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <Active />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
