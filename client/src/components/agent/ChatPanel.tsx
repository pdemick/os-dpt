import { useEffect, useRef } from "react"
import { MessageSquarePlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAgent } from "@/lib/agent/context"

import { Composer } from "./Composer"
import { Transcript } from "./Transcript"

export function ChatPanel() {
  const { isOpen, close, newChat, items, streaming, pendingQuestion, send, answer, exploreOnly } =
    useAgent()

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [items])

  if (!isOpen) return null

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-sidebar-border bg-background">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">Agent</div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void newChat()}
            title="New chat"
          >
            <MessageSquarePlusIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={close} title="Close">
            <XIcon />
          </Button>
        </div>
      </header>

      {exploreOnly && (
        <div className="border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          No worksheet open — the agent can explore and chart, but can't write SQL.
          Open a worksheet to let it stage queries.
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Transcript
          items={items}
          streaming={streaming}
          pendingQuestion={pendingQuestion}
          emptyState={
            exploreOnly
              ? "Ask about the schema or explore your data. Open a worksheet and the agent can write SQL into it."
              : "Ask about the schema, or describe a query and the agent will write SQL into the current worksheet draft."
          }
        />
      </div>

      {pendingQuestion ? (
        <div className="border-t bg-muted/40 px-3 py-2 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">Agent is asking:</div>
          <div>{pendingQuestion}</div>
        </div>
      ) : null}

      <div className="border-t px-3 py-2">
        <Composer
          pendingQuestion={pendingQuestion}
          streaming={streaming}
          send={send}
          answer={answer}
          autoFocus={isOpen}
        />
      </div>
    </aside>
  )
}
