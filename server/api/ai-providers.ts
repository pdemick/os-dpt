import { Hono } from "hono"

import type { AIProvider, AIProviderId } from "@shared/ai-providers.ts"

import { CredentialVault } from "../credentials/vault.ts"
import { AIProviderStore, type StoredAIProvider } from "../storage/ai-providers.ts"

const AI_PROVIDER_IDS: readonly AIProviderId[] = ["anthropic", "openai"] as const

const AI_PROVIDER_LABELS: Record<AIProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
}

const AI_PROVIDER_ENV_VARS: Record<AIProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
}

const vaultKey = (id: AIProviderId): string => `ai:${id}`

function isAIProviderId(value: string): value is AIProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value)
}

function last4(apiKey: string): string {
  return apiKey.slice(-4)
}

function toApi(id: AIProviderId, stored: StoredAIProvider | null): AIProvider {
  return {
    id,
    label: AI_PROVIDER_LABELS[id],
    envVar: AI_PROVIDER_ENV_VARS[id],
    configured: stored !== null,
    last4: stored?.last4,
    updatedAt: stored?.updatedAt,
  }
}

const VERIFY_TIMEOUT_MS = 10_000

async function verifyKey(id: AIProviderId, apiKey: string): Promise<void> {
  const signal = AbortSignal.timeout(VERIFY_TIMEOUT_MS)
  try {
    if (id === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(body?.error?.message ?? `Anthropic returned ${res.status}`)
      }
      return
    }
    // openai
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null
      throw new Error(body?.error?.message ?? `OpenAI returned ${res.status}`)
    }
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      throw new Error(`Request timed out after ${VERIFY_TIMEOUT_MS / 1000}s`)
    }
    throw err
  }
}

export function aiProvidersRouter(workspace: string): Hono {
  const router = new Hono()
  const store = new AIProviderStore(workspace)
  const vault = new CredentialVault(workspace)

  router.get("/", async (c) => {
    const all = await store.list()
    const providers = AI_PROVIDER_IDS.map((id) => toApi(id, all[id]))
    return c.json({ providers })
  })

  router.put("/:provider", async (c) => {
    const provider = c.req.param("provider")
    if (!isAIProviderId(provider)) {
      return c.json({ error: `Unknown provider: ${provider}` }, 400)
    }
    const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown }
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    if (apiKey === "") {
      return c.json({ error: "Missing required field: apiKey" }, 400)
    }
    // Write the secret first; only record metadata once it's safely
    // in the vault. Capture any prior key so an update-path rollback
    // restores it instead of deleting the previously-good entry.
    const previousKey = await vault.getPassword(vaultKey(provider))
    await vault.setPassword(vaultKey(provider), apiKey)
    const meta: StoredAIProvider = {
      last4: last4(apiKey),
      updatedAt: new Date().toISOString(),
    }
    try {
      await store.set(provider, meta)
    } catch (err) {
      const rollback =
        previousKey !== null
          ? vault.setPassword(vaultKey(provider), previousKey)
          : vault.deletePassword(vaultKey(provider))
      await rollback.catch((rollbackErr) => {
        console.warn(
          `Failed to roll back vault entry for ${provider} after store write failed:`,
          rollbackErr,
        )
      })
      throw err
    }
    return c.json({ provider: toApi(provider, meta) })
  })

  router.delete("/:provider", async (c) => {
    const provider = c.req.param("provider")
    if (!isAIProviderId(provider)) {
      return c.json({ error: `Unknown provider: ${provider}` }, 400)
    }
    // Clear metadata first so the UI reflects "not configured" even
    // if the vault delete later fails — a stray encrypted entry is
    // harmless, but a row that claims "configured" with no key is not.
    await store.remove(provider)
    await vault.deletePassword(vaultKey(provider))
    return c.json({ provider: toApi(provider, null) })
  })

  router.post("/:provider/test", async (c) => {
    const provider = c.req.param("provider")
    if (!isAIProviderId(provider)) {
      return c.json({ ok: false, error: `Unknown provider: ${provider}` }, 400)
    }
    const body = (await c.req.json().catch(() => ({}))) as { apiKey?: unknown }
    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
    if (apiKey === "") {
      const stored = await vault.getPassword(vaultKey(provider))
      if (stored === null) {
        return c.json({ ok: false, error: "Missing required field: apiKey" }, 400)
      }
      apiKey = stored
    }
    try {
      await verifyKey(provider, apiKey)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 400)
    }
  })

  return router
}
