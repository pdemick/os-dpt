import { useEffect, useRef, useState } from "react"
import { ArrowUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { ChatConnectionPicker } from "./ChatConnectionPicker"

/**
 * Message input shared by the worksheet side panel and the Chat page. A single
 * rounded box holds the textarea plus a toolbar row (connection picker + send).
 * Owns its own draft state and routes Enter to `send` (or `answer` when the
 * agent has a pending question); Shift+Enter inserts a newline.
 */
export function Composer({
  pendingQuestion,
  streaming,
  send,
  answer,
  autoFocus = true,
  rows = 2,
}: {
  pendingQuestion: string | null
  streaming: boolean
  send: (text: string) => Promise<void>
  answer: (text: string) => Promise<void>
  autoFocus?: boolean
  rows?: number
}) {
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus, pendingQuestion])

  const submit = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    if (pendingQuestion) {
      await answer(text)
    } else if (!streaming) {
      await send(text)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const inputDisabled = streaming && !pendingQuestion
  const canSubmit = !inputDisabled && draft.trim() !== ""
  const placeholder = pendingQuestion
    ? "Answer the question…"
    : streaming
      ? "Agent is thinking…"
      : "Ask the agent…"

  return (
    <div
      className={cn(
        "rounded-2xl border border-input bg-input/50 transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
      )}
    >
      <Textarea
        ref={inputRef}
        rows={rows}
        className="min-h-[2.75rem] resize-none rounded-2xl border-0 bg-transparent px-3 pt-2.5 pb-1 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={inputDisabled}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <ChatConnectionPicker />
        <Button
          size="icon"
          className="size-7 rounded-full"
          onClick={() => void submit()}
          disabled={!canSubmit}
          aria-label={pendingQuestion ? "Answer" : "Send"}
        >
          <ArrowUpIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
