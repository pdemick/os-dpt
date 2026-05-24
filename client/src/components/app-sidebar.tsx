import * as React from "react"
import {
  BookOpenIcon,
  DatabaseIcon,
  FileTextIcon,
  GalleryVerticalEndIcon,
  SparklesIcon,
  Settings2Icon,
} from "lucide-react"

import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export type View = "worksheets" | "connections" | "chat" | "documentation" | "settings"

const navItems: {
  id: View
  title: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: "worksheets", title: "Worksheets", icon: FileTextIcon },
  { id: "connections", title: "Connections", icon: DatabaseIcon },
  { id: "chat", title: "Chat", icon: SparklesIcon },
  { id: "documentation", title: "Documentation", icon: BookOpenIcon },
  { id: "settings", title: "Settings", icon: Settings2Icon },
]

const teams = [
  {
    name: "os-dpt",
    logo: <GalleryVerticalEndIcon />,
    plan: "Local",
  },
]

const user = {
  name: "you",
  email: "",
  avatar: "",
}

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
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
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
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
