import * as React from "react"
import {
  BookOpenIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  PlusIcon,
  SparklesIcon,
  Settings2Icon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useDashboards } from "@/lib/dashboards/store"

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
            {navItems.map((item) =>
              item.id === "dashboards" ? (
                <DashboardsNavItem
                  key={item.id}
                  item={item}
                  view={view}
                  onSelect={onSelect}
                />
              ) : (
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
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function DashboardsNavItem({
  item,
  view,
  onSelect,
}: {
  item: (typeof navItems)[number]
  view: View
  onSelect: (v: View) => void
}) {
  const { metas, selected, select, create } = useDashboards()

  return (
    <Collapsible defaultOpen className="group/collapsible" asChild>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={item.title}
          isActive={view === item.id}
          onClick={() => onSelect(item.id)}
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="data-[state=open]:rotate-90">
            <ChevronRightIcon />
            <span className="sr-only">Toggle dashboards</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {metas?.map((d) => (
              <SidebarMenuSubItem key={d.slug}>
                <SidebarMenuSubButton
                  asChild
                  isActive={view === "dashboards" && selected === d.slug}
                >
                  <button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      select(d.slug)
                      onSelect("dashboards")
                    }}
                  >
                    <span>{d.name}</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild className="text-sidebar-foreground/70">
                <button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    void create().then(() => onSelect("dashboards"))
                  }}
                >
                  <PlusIcon />
                  <span>New dashboard</span>
                </button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}
