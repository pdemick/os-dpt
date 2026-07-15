import type { UsageTotals } from "@shared/agent"

function formatTokens(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0"
  if (usd < 0.01) return "<$0.01"
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * Compact "in / out · $cost" token+cost readout, shared between the editor
 * StatusBar (per-worksheet totals) and the chat surfaces (per-conversation
 * totals). Renders nothing until at least one call has been folded in.
 */
export function UsageCounter({
  usage,
  className,
}: {
  usage: UsageTotals | null
  className?: string
}) {
  if (!usage || usage.calls === 0) return null
  return (
    <span
      className={className}
      title={`Input ${usage.inputTokens.toLocaleString()} · Output ${usage.outputTokens.toLocaleString()} · Cache read ${usage.cacheReadTokens.toLocaleString()} · Cache write ${usage.cacheCreationTokens.toLocaleString()} · ${usage.calls} call${usage.calls === 1 ? "" : "s"}`}
    >
      {formatTokens(usage.inputTokens)} in / {formatTokens(usage.outputTokens)} out
      {" · "}
      {formatCost(usage.costUsd)}
    </span>
  )
}
