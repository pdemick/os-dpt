import { useEffect, useState } from "react"

import { emptyTotals, type UsageTotals } from "@shared/agent"

import { useAgent } from "@/lib/agent/context"
import { agentApi } from "@/lib/agent/api"

/**
 * Token + cost totals for a specific worksheet, aggregated across every
 * chat session that targeted it. Refetches when:
 *   - the slug changes
 *   - the agent stops streaming (so a turn that just finished is folded in)
 */
export function useWorksheetUsage(slug: string | null): UsageTotals | null {
  const { streaming } = useAgent()
  const [totals, setTotals] = useState<UsageTotals | null>(null)

  useEffect(() => {
    if (!slug) {
      setTotals(null)
      return
    }
    let cancelled = false
    void agentApi
      .getWorksheetUsage(slug)
      .then((res) => {
        if (!cancelled) setTotals(res.totals)
      })
      .catch(() => {
        if (!cancelled) setTotals(emptyTotals())
      })
    return () => {
      cancelled = true
    }
    // `streaming` flipping false is the signal that a turn just persisted
    // new usage on the server, so we re-pull.
  }, [slug, streaming])

  return totals
}
