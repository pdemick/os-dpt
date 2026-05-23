import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * Message input shared by the worksheet side panel and the Chat page. Owns its
 * own draft state and routes Enter to `send` (or `answer` when the agent has a
 * pending question). Shift+Enter inserts a newline.
 */
export function Composer({
  pendingQuestion,
  streaming,
  send,
  answer,
  autoFocus = true,
  rows = 3,
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

  const disabled = streaming && !pendingQuestion
  const placeholder = pendingQuestion
    ? "Answer the question…"
    : streaming
      ? "Agent is thinking…"
      : "Ask the agent…"

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={inputRef}
        rows={rows}
        className="resize-none text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={disabled || draft.trim() === ""}
        >
          {pendingQuestion ? "Answer" : "Send"}
        </Button>
      </div>
    </div>
  )
}
