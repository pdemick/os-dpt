import { useCallback } from "react"

import { Composer } from "@/components/agent/Composer"
import { Transcript } from "@/components/agent/Transcript"
import { useStickToBottom } from "@/hooks/use-stick-to-bottom"
import { useAgent } from "@/lib/agent/context"
import { useAppIntent } from "@/lib/app-intents"

// The standalone AgentChatProvider this view consumes lives in the app shell
// (App.tsx), shared with the sidebar's Chat submenu — which also replaced the
// chat list rail that used to render here.
export function Chat() {
  return (
    <>
      <ChatIntents />
      <div className="flex min-h-0 flex-1">
        <Conversation />
      </div>
    </>
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
