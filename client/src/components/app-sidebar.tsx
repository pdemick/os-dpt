import * as React from "react"
import {
  BookOpenIcon,
  DatabaseIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  SparklesIcon,
  Settings2Icon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export type View =
  | "worksheets"
  | "dashboards"
  | "connections"
  | "chat"
  | "documentation"
  | "settings"

const navItems: {
  id: View
  title: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: "chat", title: "Chat", icon: SparklesIcon },
  { id: "worksheets", title: "Worksheets", icon: FileTextIcon },
  { id: "dashboards", title: "Dashboards", icon: LayoutDashboardIcon },
  { id: "connections", title: "Connections", icon: DatabaseIcon },
  { id: "documentation", title: "Documentation", icon: BookOpenIcon },
  { id: "settings", title: "Settings", icon: Settings2Icon },
]

export function AppSidebar({
  view,
  onSelect,
  ...props
}: {
  view: View
  onSelect: (v: View) => void
} & Omit<React.ComponentProps<typeof Sidebar>, "onSelect">) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 p-2 text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <DatabaseIcon className="size-4" />
            </div>
            <span className="truncate text-sm font-semibold">Data Profile Tool</span>
          </div>
          <SidebarTrigger className="text-sidebar-foreground/60 group-data-[collapsible=icon]:mx-auto" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={view === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
