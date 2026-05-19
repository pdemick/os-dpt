import type {
  QueryResponse,
  Session,
  SQLNamespace,
  WorksheetMeta,
  WorksheetPayload,
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

  createWorksheet: async (name: string): Promise<WorksheetMeta> =>
    jsonOrThrow(
      await fetch("/api/worksheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    ),

  getWorksheet: async (slug: string): Promise<WorksheetPayload> =>
    jsonOrThrow(await fetch(`/api/worksheets/${encodeURIComponent(slug)}`)),

  saveWorksheet: async (slug: string, content: string): Promise<WorksheetMeta> =>
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

  putDraft: async (slug: string, content: string): Promise<void> => {
    await fetch(`/api/drafts/${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    })
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
