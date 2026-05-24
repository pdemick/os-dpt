import type { ContextDocMeta, ContextDocPayload } from "@shared/context"

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(body.error ?? body.message ?? `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

// `connectionId` scopes to a data source; null/undefined → the unassigned set.
function scopeQuery(connectionId?: string | null): string {
  return connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ""
}

export const contextApi = {
  listDocs: async (connectionId?: string | null): Promise<ContextDocMeta[]> => {
    const data = await jsonOrThrow<{ docs: ContextDocMeta[] }>(
      await fetch(`/api/context${scopeQuery(connectionId)}`),
    )
    return data.docs
  },

  getDoc: async (name: string, connectionId?: string | null): Promise<ContextDocPayload> =>
    jsonOrThrow(
      await fetch(`/api/context/${encodeURIComponent(name)}${scopeQuery(connectionId)}`),
    ),

  saveDoc: async (
    name: string,
    content: string,
    connectionId?: string | null,
  ): Promise<{ meta: ContextDocMeta }> =>
    jsonOrThrow(
      await fetch(`/api/context/${encodeURIComponent(name)}${scopeQuery(connectionId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    ),
}
