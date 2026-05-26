export type AIProviderId = "anthropic" | "openai" | "braintrust"

/** "model" = LLM API key; "observability" = tracing/eval platform (Braintrust). */
export type AIProviderKind = "model" | "observability"

export type AIProvider = {
  id: AIProviderId
  label: string
  kind: AIProviderKind
  envVar: string
  configured: boolean
  last4?: string
  updatedAt?: string
}

export type SetAIProviderInput = { apiKey: string }

export type TestAIProviderInput = { apiKey?: string }

export type AIProviderTestResult = { ok: true } | { ok: false; error: string }
