import type {
  HistorySkipReason,
  QueryResponse,
  Session,
  SaveWorksheetResponse,
  SQLNamespace,
  WorksheetMeta,
  WorksheetPayload,
  WorksheetSearchHit,
} from "@shared/types"

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const api = {
  listWorksheets: async (): Promise<WorksheetMeta[]> => {
    const data = await jsonOrThrow<{ worksheets: WorksheetMeta[] }>(
      await fetch("/api/worksheets"),
    )
    return data.worksheets
  },

  createWorksheet: async (name?: string): Promise<WorksheetMeta> =>
    jsonOrThrow(
      await fetch("/api/worksheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(name ? { name } : {}),
      }),
    ),

  renameWorksheet: async (slug: string, name: string): Promise<WorksheetMeta> =>
    jsonOrThrow(
      await fetch(`/api/worksheets/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    ),

  autoNameWorksheet: async (
    slug: string,
    sql: string,
  ): Promise<{ name: string; skipped: boolean }> =>
    jsonOrThrow(
      await fetch(`/api/worksheets/${encodeURIComponent(slug)}/auto-name`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql }),
      }),
    ),

  getWorksheet: async (slug: string): Promise<WorksheetPayload> =>
    jsonOrThrow(await fetch(`/api/worksheets/${encodeURIComponent(slug)}`)),

  saveWorksheet: async (slug: string, content: string): Promise<SaveWorksheetResponse> =>
    jsonOrThrow(
      await fetch(`/api/worksheets/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    ),

  deleteWorksheet: async (slug: string): Promise<void> => {
    await fetch(`/api/worksheets/${encodeURIComponent(slug)}`, { method: "DELETE" })
  },

  searchWorksheets: async (q: string): Promise<WorksheetSearchHit[]> => {
    const data = await jsonOrThrow<{ hits: WorksheetSearchHit[] }>(
      await fetch(`/api/worksheets/search?q=${encodeURIComponent(q)}`),
    )
    return data.hits
  },

  putDraft: async (slug: string, content: string): Promise<HistorySkipReason | null> => {
    const data = await jsonOrThrow<{ ok: boolean; historySkipped: HistorySkipReason | null }>(
      await fetch(`/api/drafts/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    )
    return data.historySkipped
  },

  deleteDraft: async (slug: string): Promise<void> => {
    await fetch(`/api/drafts/${encodeURIComponent(slug)}`, { method: "DELETE" })
  },

  getSession: async (): Promise<Session> =>
    jsonOrThrow(await fetch("/api/session")),

  putSession: async (session: Session): Promise<void> => {
    await fetch("/api/session", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(session),
    })
  },

  getSchema: async (): Promise<SQLNamespace> =>
    jsonOrThrow(await fetch("/api/schema")),

  getConnectionSchema: async (id: string): Promise<SQLNamespace> =>
    jsonOrThrow(await fetch(`/api/connections/${encodeURIComponent(id)}/schema`)),

  refreshConnectionSchema: async (id: string): Promise<SQLNamespace> =>
    jsonOrThrow(
      await fetch(`/api/connections/${encodeURIComponent(id)}/schema/refresh`, {
        method: "POST",
      }),
    ),

  runQuery: async (id: string, sql: string): Promise<QueryResponse> => {
    const res = await fetch(`/api/connections/${encodeURIComponent(id)}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    })
    // The server returns 200 for SQL errors (with ok:false); other statuses
    // (e.g. 409 not_connected) we surface as a QueryErr too.
    const body = (await res.json().catch(() => ({}))) as QueryResponse | { error?: string }
    if ("ok" in body) return body
    return { ok: false, error: typeof body.error === "string" ? body.error : `${res.status}` }
  },
}
