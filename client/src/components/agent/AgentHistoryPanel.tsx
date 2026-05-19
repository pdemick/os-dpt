import { MessageSquareText, Trash2 } from "lucide-react"

import type { ChatSessionMeta } from "@shared/agent"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAgent } from "@/lib/agent/context"
import { cn } from "@/lib/utils"

interface Props {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AgentHistoryPanel({ slug, open, onOpenChange }: Props) {
  const { chatsForActive, loadSession, deleteChat, session } = useAgent()
  const currentId = session?.id ?? null

  const handlePick = async (id: string) => {
    if (id !== currentId) await loadSession(id)
    onOpenChange(false)
  }

  const handleDelete = async (id: string) => {
    await deleteChat(id)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] flex-col p-0 sm:max-w-[420px]!">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-sm">Agent chats · {slug}</SheetTitle>
          <SheetDescription className="sr-only">
            Past agent conversations for this worksheet. Click one to reopen it.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {chatsForActive.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No chats yet for this worksheet.
              </div>
            )}
            {chatsForActive.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                current={chat.id === currentId}
                onPick={() => void handlePick(chat.id)}
                onDelete={() => void handleDelete(chat.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function ChatRow({
  chat,
  current,
  onPick,
  onDelete,
}: {
  chat: ChatSessionMeta
  current: boolean
  onPick: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "group relative flex items-start gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted/60",
        current && "bg-muted/40",
      )}
    >
      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={onPick}
        className="min-w-0 flex-1 overflow-hidden text-left"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">
            {chat.title ?? "Untitled chat"}
          </span>
          {current && (
            <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
              current
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {relativeTime(chat.updatedAt)}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete chat"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = Date.now() - then
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return "just now"
  if (diff < hour) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hour)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  return new Date(iso).toLocaleDateString()
}
