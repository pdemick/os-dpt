import type {
  AIProvider,
  AIProviderId,
  AIProviderTestResult,
} from "@shared/ai-providers.ts"
import type {
  Connection,
  NewConnectionInput,
  TestResult,
} from "@shared/connections.ts"

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const error =
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`
    return { ok: false, status: res.status, error }
  }
  return { ok: true, data: body as T }
}

export const api = {
  listConnections: () =>
    request<{ connections: Connection[] }>("/connections"),

  createConnection: (input: NewConnectionInput) =>
    request<{ connection: Connection }>("/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  testConnection: (input: NewConnectionInput) =>
    request<TestResult>("/connections/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  deleteConnection: (id: string) =>
    request<{ ok: true }>(`/connections/${id}`, { method: "DELETE" }),

  connect: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/connections/${id}/connect`, {
      method: "POST",
    }),

  disconnect: (id: string) =>
    request<{ ok: true }>(`/connections/${id}/disconnect`, { method: "POST" }),

  listAIProviders: () =>
    request<{ providers: AIProvider[] }>("/ai-providers"),

  setAIProviderKey: (id: AIProviderId, apiKey: string) =>
    request<{ provider: AIProvider }>(`/ai-providers/${id}`, {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),

  deleteAIProviderKey: (id: AIProviderId) =>
    request<{ provider: AIProvider }>(`/ai-providers/${id}`, {
      method: "DELETE",
    }),

  testAIProviderKey: (id: AIProviderId, apiKey?: string) =>
    request<AIProviderTestResult>(`/ai-providers/${id}/test`, {
      method: "POST",
      body: JSON.stringify(apiKey ? { apiKey } : {}),
    }),
}
