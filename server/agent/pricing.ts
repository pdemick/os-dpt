import type Anthropic from "@anthropic-ai/sdk"

/**
 * Per-1M-token USD rates for Anthropic models. Cache-write rate assumes
 * the 5-minute ephemeral TTL (the SDK default). Keep this table updated
 * as Anthropic publishes new pricing — it's the only source of truth
 * for cost numbers stored in session transcripts.
 */
export interface ModelRates {
  inputPer1M: number
  outputPer1M: number
  cacheWritePer1M: number
  cacheReadPer1M: number
}

const PRICING: Record<string, ModelRates> = {
  "claude-opus-4-7": {
    inputPer1M: 15,
    outputPer1M: 75,
    cacheWritePer1M: 18.75,
    cacheReadPer1M: 1.5,
  },
  "claude-sonnet-4-6": {
    inputPer1M: 3,
    outputPer1M: 15,
    cacheWritePer1M: 3.75,
    cacheReadPer1M: 0.3,
  },
  "claude-haiku-4-5": {
    inputPer1M: 1,
    outputPer1M: 5,
    cacheWritePer1M: 1.25,
    cacheReadPer1M: 0.1,
  },
}

const FALLBACK: ModelRates = PRICING["claude-sonnet-4-6"]!

export function ratesFor(model: string): ModelRates {
  // Strip trailing date suffixes like "-20251001" and prerelease tags
  // so "claude-sonnet-4-6-20251001" still resolves to the base entry.
  const direct = PRICING[model]
  if (direct) return direct
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key]!
  }
  return FALLBACK
}

/** Compute USD cost from an Anthropic usage block for the given model. */
export function costFromUsage(
  model: string,
  usage: Anthropic.Usage,
): number {
  const r = ratesFor(model)
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  return (
    (input * r.inputPer1M +
      output * r.outputPer1M +
      cacheWrite * r.cacheWritePer1M +
      cacheRead * r.cacheReadPer1M) /
    1_000_000
  )
}
