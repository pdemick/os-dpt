import { useCallback } from "react"
import { MessageSquarePlusIcon, MessageSquareText, Trash2 } from "lucide-react"

import type { ChatSessionMeta } from "@shared/agent"

import { Composer } from "@/components/agent/Composer"
import { Transcript } from "@/components/agent/Transcript"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStickToBottom } from "@/hooks/use-stick-to-bottom"
import { AgentChatProvider, useAgent } from "@/lib/agent/context"
import { useAppIntent } from "@/lib/app-intents"
import { cn } from "@/lib/utils"

export function Chat() {
  // Standalone surface: no worksheet binding, so the agent runs SQL and
  // visualizes results (write_sql is withheld server-side for these chats).
  return (
    <AgentChatProvider worksheetSlug={null} standalone>
      <ChatIntents />
      <div className="flex min-h-0 flex-1">
        <ChatList />
        <Conversation />
      </div>
    </AgentChatProvider>
  )
}

// Runs the "New chat" quick action once this view is mounted.
function ChatIntents() {
  const { newChat } = useAgent()
  useAppIntent(
    "new-chat",
    useCallback(() => void newChat(), [newChat])
  )
  return null
}

function ChatList() {
  const { chatsForActive, session, loadSession, deleteChat, newChat } =
    useAgent()
  const currentId = session?.id ?? null

  return (
    <aside className="m-2 flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-sidebar-border bg-sidebar shadow-md">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium text-sidebar-foreground/70">
          Chats
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => void newChat()}
          title="New chat"
        >
          <MessageSquarePlusIcon />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {chatsForActive.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No chats yet.
            </div>
          ) : (
            chatsForActive.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                current={chat.id === currentId}
                onPick={() =>
                  void (chat.id !== currentId && loadSession(chat.id))
                }
                onDelete={() => void deleteChat(chat.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
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
        current && "bg-muted/50"
      )}
    >
      <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={onPick}
        className="min-w-0 flex-1 overflow-hidden text-left"
      >
        <span className="block truncate font-medium">
          {chat.title ?? "Untitled chat"}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {relativeTime(chat.updatedAt)}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete chat"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function Conversation() {
  const { session, items, streaming, pendingQuestion, send, answer } = useAgent()
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>(items, session?.id ?? null)

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <Transcript
            items={items}
            streaming={streaming}
            pendingQuestion={pendingQuestion}
            emptyState="Ask a question about your data. The agent will run SQL against the active connection and visualize the results here."
          />
        </div>
      </div>

      {pendingQuestion ? (
        <div className="border-t bg-muted/40 py-2">
          <div className="mx-auto w-full max-w-3xl px-6 text-xs">
            <span className="font-medium text-muted-foreground">
              Agent is asking:{" "}
            </span>
            {pendingQuestion}
          </div>
        </div>
      ) : null}

      <div className="py-3">
        <div className="mx-auto w-full max-w-3xl px-6">
          <Composer
            pendingQuestion={pendingQuestion}
            streaming={streaming}
            send={send}
            answer={answer}
            rows={2}
          />
        </div>
      </div>
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
