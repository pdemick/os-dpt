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
  Trash2Icon,
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
import { useAgent } from "@/lib/agent/context"
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
              ) : item.id === "chat" ? (
                <ChatNavItem
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

function ChatNavItem({
  item,
  view,
  onSelect,
}: {
  item: (typeof navItems)[number]
  view: View
  onSelect: (v: View) => void
}) {
  // The app-shell provider is the standalone one, so this lists Chat-page
  // conversations (worksheet-bound chats live in the Worksheets side panel).
  const { chatsForActive, session, loadSession, newChat, deleteChat } = useAgent()
  const currentId = session?.id ?? null

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
            <span className="sr-only">Toggle chats</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* max-h-56 ≈ 7 rows (h-7 + gap-1); older chats scroll while the
              New-chat action below stays pinned. */}
          <SidebarMenuSub className="max-h-56 overflow-y-auto">
            {chatsForActive.map((chat) => (
              <SidebarMenuSubItem key={chat.id}>
                <SidebarMenuSubButton
                  asChild
                  isActive={view === "chat" && currentId === chat.id}
                >
                  <button
                    type="button"
                    className="w-full pr-6"
                    onClick={() => {
                      if (chat.id !== currentId) void loadSession(chat.id)
                      onSelect("chat")
                    }}
                  >
                    <span>{chat.title ?? "Untitled chat"}</span>
                  </button>
                </SidebarMenuSubButton>
                <button
                  type="button"
                  aria-label={`Delete ${chat.title ?? "chat"}`}
                  onClick={() => void deleteChat(chat.id)}
                  className="absolute top-1.5 right-1 flex size-4 items-center justify-center rounded text-sidebar-foreground/60 opacity-0 transition-opacity group-hover/menu-sub-item:opacity-100 focus-visible:opacity-100 hover:text-destructive [&>svg]:size-3.5"
                >
                  <Trash2Icon />
                </button>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild className="text-sidebar-foreground/70">
                <button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    void newChat()
                    onSelect("chat")
                  }}
                >
                  <PlusIcon />
                  <span>New chat</span>
                </button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
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
          {/* max-h-56 ≈ 7 rows (h-7 + gap-1); the list scrolls while the
              New-dashboard action below stays pinned. */}
          <SidebarMenuSub className="max-h-56 overflow-y-auto">
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
          </SidebarMenuSub>
          <SidebarMenuSub>
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
