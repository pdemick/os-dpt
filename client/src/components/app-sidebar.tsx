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
import { useWorksheets } from "@/hooks/use-worksheets"
import { cn } from "@/lib/utils"

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
  { id: "documentation", title: "Context", icon: BookOpenIcon },
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
            {navItems.map((item) => {
              switch (item.id) {
                case "chat":
                  return <ChatNavItem key={item.id} item={item} view={view} onSelect={onSelect} />
                case "worksheets":
                  return <WorksheetsNavItem key={item.id} item={item} view={view} onSelect={onSelect} />
                case "dashboards":
                  return <DashboardsNavItem key={item.id} item={item} view={view} onSelect={onSelect} />
                default:
                  return (
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
                  )
              }
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

type NavItemProps = {
  item: (typeof navItems)[number]
  view: View
  onSelect: (v: View) => void
}

type SubItem = {
  key: string
  label: string
  isActive: boolean
  onPick: () => void
  /** Renders a hover delete button when provided. */
  onDelete?: () => void
}

/**
 * Nav item with a collapsible submenu: the button navigates to the view, the
 * chevron toggles the list, and a pinned "new" action sits below it. The list
 * caps at ~7 rows (max-h-56 = 7 × h-7 + gaps) and scrolls beyond that.
 */
function CollapsibleNavItem({
  item,
  view,
  onSelect,
  subItems,
  newLabel,
  onNew,
}: NavItemProps & {
  subItems: SubItem[]
  newLabel: string
  onNew: () => void
}) {
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
            <span className="sr-only">Toggle {item.title.toLowerCase()}</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="max-h-56 overflow-y-auto">
            {subItems.map((sub) => (
              <SidebarMenuSubItem key={sub.key}>
                <SidebarMenuSubButton asChild isActive={sub.isActive}>
                  <button
                    type="button"
                    className={cn("w-full", sub.onDelete && "pr-6")}
                    onClick={sub.onPick}
                  >
                    <span>{sub.label}</span>
                  </button>
                </SidebarMenuSubButton>
                {sub.onDelete ? (
                  <button
                    type="button"
                    aria-label={`Delete ${sub.label}`}
                    onClick={sub.onDelete}
                    className="absolute top-1.5 right-1 flex size-4 items-center justify-center rounded text-sidebar-foreground/60 opacity-0 transition-opacity group-hover/menu-sub-item:opacity-100 focus-visible:opacity-100 hover:text-destructive [&>svg]:size-3.5"
                  >
                    <Trash2Icon />
                  </button>
                ) : null}
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild className="text-sidebar-foreground/70">
                <button type="button" className="w-full" onClick={onNew}>
                  <PlusIcon />
                  <span>{newLabel}</span>
                </button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function ChatNavItem(props: NavItemProps) {
  // The app-shell provider is the standalone one, so this lists Chat-page
  // conversations (worksheet-bound chats live in the Worksheets side panel).
  const { chatsForActive, session, loadSession, newChat, deleteChat } = useAgent()
  const { view, onSelect } = props
  const currentId = session?.id ?? null

  return (
    <CollapsibleNavItem
      {...props}
      subItems={chatsForActive.map((chat) => ({
        key: chat.id,
        label: chat.title ?? "Untitled chat",
        isActive: view === "chat" && currentId === chat.id,
        onPick: () => {
          if (chat.id !== currentId) void loadSession(chat.id)
          onSelect("chat")
        },
        onDelete: () => void deleteChat(chat.id),
      }))}
      newLabel="New chat"
      onNew={() => {
        void newChat()
        onSelect("chat")
      }}
    />
  )
}

function WorksheetsNavItem(props: NavItemProps) {
  const { list, session, openTab, createWorksheet, deleteWorksheet } = useWorksheets()
  const { view, onSelect } = props

  return (
    <CollapsibleNavItem
      {...props}
      subItems={list.map((ws) => ({
        key: ws.slug,
        label: ws.name,
        isActive: view === "worksheets" && session.activeSlug === ws.slug,
        onPick: () => {
          void openTab(ws.slug)
          onSelect("worksheets")
        },
        onDelete: () => void deleteWorksheet(ws.slug),
      }))}
      newLabel="New worksheet"
      onNew={() => {
        void createWorksheet().then(() => onSelect("worksheets"))
      }}
    />
  )
}

function DashboardsNavItem(props: NavItemProps) {
  const { metas, selected, select, create } = useDashboards()
  const { view, onSelect } = props

  return (
    <CollapsibleNavItem
      {...props}
      subItems={(metas ?? []).map((d) => ({
        key: d.slug,
        label: d.name,
        isActive: view === "dashboards" && selected === d.slug,
        onPick: () => {
          select(d.slug)
          onSelect("dashboards")
        },
      }))}
      newLabel="New dashboard"
      onNew={() => {
        void create().then(() => onSelect("dashboards"))
      }}
    />
  )
}
