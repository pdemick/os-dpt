import { memo, useEffect, useRef, useState } from "react"
import { CheckIcon, Loader2Icon, MessageSquarePlusIcon, XIcon } from "lucide-react"
import { Streamdown } from "streamdown"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAgent, type TranscriptItem } from "@/lib/agent/context"
import { cn } from "@/lib/utils"

export function ChatPanel() {
  const { isOpen, close, newChat, items, streaming, pendingQuestion, send, answer } =
    useAgent()

  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen, pendingQuestion])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [items])

  if (!isOpen) return null

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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {items.length === 0 && !streaming ? (
          <div className="text-xs text-muted-foreground">
            Ask about the schema, or describe a query and the agent will write SQL into the
            current worksheet draft.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((it) => (
              <MemoTranscriptRow key={it.id} item={it} />
            ))}
            {streaming && !pendingQuestion ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" /> streaming…
              </div>
            ) : null}
          </div>
        )}
      </div>

      {pendingQuestion ? (
        <div className="border-t bg-muted/40 px-3 py-2 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">Agent is asking:</div>
          <div>{pendingQuestion}</div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t px-3 py-2">
        <Textarea
          ref={inputRef}
          rows={3}
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
    </aside>
  )
}

function TranscriptRow({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
            {item.text}
          </div>
        </div>
      )
    case "assistant_text":
      return (
        <div className="flex justify-start">
          <div
            className={cn(
              "max-w-[85%] text-sm leading-relaxed",
              "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
              "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
              "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_li]:my-0.5",
              "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
              "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
              "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
              "[&_strong]:font-semibold",
              "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
              "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
              "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-2 [&_pre]:text-xs",
              "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
              "[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs",
              "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
              "[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
              "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
              "[&_hr]:my-3 [&_hr]:border-border",
            )}
          >
            <Streamdown>{item.text}</Streamdown>
          </div>
        </div>
      )
    case "tool":
      return (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
            item.status === "error"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {item.status === "running" ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : item.status === "error" ? (
            <XIcon className="size-3" />
          ) : (
            <CheckIcon className="size-3" />
          )}
          <span className="font-mono">{item.name}</span>
          {item.summary ? <span className="truncate">— {item.summary}</span> : null}
        </div>
      )
    case "sql_written":
      return (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-muted-foreground">
          → wrote {item.length} chars to <span className="font-mono">{item.worksheetSlug}</span>{" "}
          draft
        </div>
      )
    case "ask_user":
      return (
        <div className="rounded-md border border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          ❓ {item.question}
        </div>
      )
    case "error":
      return (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {item.message}
        </div>
      )
  }
}

const MemoTranscriptRow = memo(TranscriptRow, (prev, next) => prev.item === next.item)
