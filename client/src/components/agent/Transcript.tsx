import { memo } from "react"
import type { ReactNode } from "react"
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react"
import { Streamdown } from "streamdown"

import type { TranscriptItem } from "@/lib/agent/context"
import { cn } from "@/lib/utils"

import { ChartView } from "./ChartView"

export function TranscriptRow({ item }: { item: TranscriptItem }) {
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
    case "chart":
      return <ChartView spec={item.spec} />
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

/**
 * Renders a conversation: the transcript rows, a streaming indicator while the
 * agent works, and an empty state before anything has been said.
 */
export function Transcript({
  items,
  streaming,
  pendingQuestion,
  emptyState,
}: {
  items: TranscriptItem[]
  streaming: boolean
  pendingQuestion: string | null
  emptyState: ReactNode
}) {
  if (items.length === 0 && !streaming) {
    return <div className="text-xs text-muted-foreground">{emptyState}</div>
  }
  return (
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
  )
}
