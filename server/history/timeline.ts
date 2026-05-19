import { listEntries } from "./query.ts"
import { listGitCommits } from "./git.ts"
import type { TimelineItem } from "@shared/types.ts"

export async function buildTimeline(slug: string): Promise<TimelineItem[]> {
  const entries = listEntries(slug)
  const commits = await listGitCommits(slug)
  const items: TimelineItem[] = [
    ...entries.map((entry) => ({ kind: "history" as const, entry })),
    ...commits,
  ]
  items.sort((a, b) => {
    const at = a.kind === "history" ? a.entry.ts : a.ts
    const bt = b.kind === "history" ? b.entry.ts : b.ts
    return bt - at
  })
  return items
}
