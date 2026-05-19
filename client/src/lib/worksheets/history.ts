import type {
  HistoryEntry,
  HistoryEntryDetail,
  TimelineItem,
  WorksheetMeta,
} from "@shared/types"

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

function enc(slug: string): string {
  return encodeURIComponent(slug)
}

export const historyApi = {
  list: async (slug: string): Promise<HistoryEntry[]> => {
    const data = await jsonOrThrow<{ entries: HistoryEntry[] }>(
      await fetch(`/api/history/${enc(slug)}`),
    )
    return data.entries
  },

  timeline: async (slug: string): Promise<TimelineItem[]> => {
    const data = await jsonOrThrow<{ items: TimelineItem[] }>(
      await fetch(`/api/history/${enc(slug)}/timeline`),
    )
    return data.items
  },

  getEntry: async (slug: string, id: number): Promise<HistoryEntryDetail> => {
    const data = await jsonOrThrow<{ entry: HistoryEntryDetail }>(
      await fetch(`/api/history/${enc(slug)}/entry/${id}`),
    )
    return data.entry
  },

  getGitFile: async (slug: string, sha: string): Promise<string> => {
    const data = await jsonOrThrow<{ sha: string; content: string }>(
      await fetch(`/api/history/${enc(slug)}/git/${sha}`),
    )
    return data.content
  },

  revert: async (
    slug: string,
    id: number,
  ): Promise<{ meta: WorksheetMeta; content: string }> =>
    jsonOrThrow(
      await fetch(`/api/history/${enc(slug)}/revert/${id}`, { method: "POST" }),
    ),
}
