import { Database, FileText, Settings as SettingsIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export type View = "worksheets" | "connections" | "settings"

const items: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "worksheets", label: "Worksheets", icon: FileText },
  { id: "connections", label: "Connections", icon: Database },
  { id: "settings", label: "Settings", icon: SettingsIcon },
]

export function AppSidebar({
  view,
  onSelect,
}: {
  view: View
  onSelect: (v: View) => void
}) {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="font-semibold">os-dpt</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={view === item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
