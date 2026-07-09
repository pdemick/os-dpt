import { useMemo } from "react"
import { Streamdown } from "streamdown"

import { cn } from "@/lib/utils"

/**
 * Compact prose styling for markdown rendered inside transcript rows (diff
 * chunks, context-file previews). Smaller/tighter than the assistant bubble's
 * styles since these live inside dense tool rows.
 */
const PROSE_CLASSES = cn(
  "text-xs leading-relaxed",
  "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4",
  "[&_li]:my-0",
  "[&_h1]:mt-2 [&_h1]:mb-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h1:first-child]:mt-0",
  "[&_h2]:mt-2 [&_h2]:mb-0.5 [&_h2]:text-xs [&_h2]:font-semibold [&_h2:first-child]:mt-0",
  "[&_h3]:mt-2 [&_h3]:mb-0.5 [&_h3]:text-xs [&_h3]:font-semibold [&_h3:first-child]:mt-0",
  "[&_strong]:font-semibold",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-1.5 [&_pre]:text-[11px]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-1 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[11px]",
  "[&_th]:border [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border [&_td]:px-1.5 [&_td]:py-0.5 [&_td]:align-top",
  "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-2 [&_hr]:border-border",
)

/** Markdown rendered with the transcript's compact prose styling. */
export function MarkdownProse({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(PROSE_CLASSES, className)}>
      <Streamdown>{children}</Streamdown>
    </div>
  )
}

interface Chunk {
  kind: "same" | "removed" | "added"
  lines: string[]
}

function toLines(text: string): string[] {
  // Strip one trailing newline so files ending in "\n" don't diff with a
  // phantom empty last line.
  return text === "" ? [] : text.replace(/\n$/, "").split("\n")
}

/** Above this the LCS table gets big; fall back to whole-block removed/added. */
const MAX_LCS_CELLS = 250_000

/**
 * Line-level diff of `a` → `b` as chunks of consecutive same/removed/added
 * lines. Common prefix/suffix are trimmed first; the middle is diffed with
 * LCS, with removals grouped before additions per hunk (git-style).
 */
function diffLines(a: string[], b: string[]): Chunk[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const chunks: Chunk[] = []
  const push = (kind: Chunk["kind"], lines: string[]) => {
    if (lines.length === 0) return
    const last = chunks[chunks.length - 1]
    if (last?.kind === kind) last.lines.push(...lines)
    else chunks.push({ kind, lines: [...lines] })
  }

  push("same", a.slice(0, start))

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (midA.length * midB.length > MAX_LCS_CELLS) {
    push("removed", midA)
    push("added", midB)
  } else {
    const m = midA.length
    const n = midB.length
    const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < m || j < n) {
      if (i < m && j < n && midA[i] === midB[j]) {
        push("same", [midA[i]])
        i++
        j++
        continue
      }
      // One hunk: consume the whole run of non-matching lines, removals first.
      const removed: string[] = []
      const added: string[] = []
      while (i < m || j < n) {
        if (i < m && j < n && midA[i] === midB[j]) break
        if (j >= n || (i < m && dp[i + 1][j] >= dp[i][j + 1])) removed.push(midA[i++])
        else added.push(midB[j++])
      }
      push("removed", removed)
      push("added", added)
    }
  }

  push("same", a.slice(endA))
  return chunks
}

/** Unchanged chunks longer than this collapse to context + a hidden-lines marker. */
const SAME_CHUNK_MAX_LINES = 8
const SAME_CHUNK_CONTEXT_LINES = 3

function HiddenLines({ count }: { count: number }) {
  return (
    <div className="py-0.5 text-center text-[10px] text-muted-foreground">
      ⋯ {count} unchanged lines ⋯
    </div>
  )
}

function SameChunk({ lines }: { lines: string[] }) {
  if (lines.length > SAME_CHUNK_MAX_LINES) {
    return (
      <>
        <MarkdownProse className="opacity-60">
          {lines.slice(0, SAME_CHUNK_CONTEXT_LINES).join("\n")}
        </MarkdownProse>
        <HiddenLines count={lines.length - SAME_CHUNK_CONTEXT_LINES * 2} />
        <MarkdownProse className="opacity-60">
          {lines.slice(-SAME_CHUNK_CONTEXT_LINES).join("\n")}
        </MarkdownProse>
      </>
    )
  }
  return <MarkdownProse className="opacity-60">{lines.join("\n")}</MarkdownProse>
}

/**
 * A context-file change rendered as a git-style diff of *formatted* markdown:
 * removed/added chunks get red/green tinting, unchanged context renders dimmed
 * (long runs collapsed), and everything is rendered markdown rather than raw
 * `###` source. `trimmed` reports unchanged lines the server already dropped
 * from both snapshots; they render as the same hidden-line markers.
 */
export function MarkdownDiff({
  before,
  after,
  trimmed,
}: {
  before: string
  after: string
  trimmed?: { leading: number; trailing: number }
}) {
  const chunks = useMemo(() => diffLines(toLines(before), toLines(after)), [before, after])
  return (
    <div className="flex flex-col gap-1">
      {trimmed && trimmed.leading > 0 ? <HiddenLines count={trimmed.leading} /> : null}
      {chunks.map((chunk, i) =>
        chunk.kind === "same" ? (
          <SameChunk key={i} lines={chunk.lines} />
        ) : (
          <div
            key={i}
            className={cn(
              "rounded-sm border-l-2 px-2 py-1",
              chunk.kind === "added"
                ? "border-green-600 bg-green-500/10"
                : "border-red-600 bg-red-500/10",
            )}
          >
            <MarkdownProse>{chunk.lines.join("\n")}</MarkdownProse>
          </div>
        ),
      )}
      {trimmed && trimmed.trailing > 0 ? <HiddenLines count={trimmed.trailing} /> : null}
    </div>
  )
}
