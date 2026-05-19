import type { ReactNode } from "react"

import { useWorksheets } from "@/hooks/use-worksheets"
import { ResultsPane } from "./ResultsPane"

interface Props {
  editor: ReactNode
}

// Editor flexes to fill the available space; the results pane appears
// directly underneath once a query has been run, taking a fixed-height
// scrollable slot. Switching tabs swaps both halves together.
export function EditorWithResults({ editor }: Props) {
  const { session, runtimes } = useWorksheets()
  const slug = session.activeSlug
  const runtime = slug ? runtimes[slug] : undefined
  const hasResults = !!runtime?.running || !!runtime?.lastResult

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">{editor}</div>
      {hasResults && (
        <div className="h-80 shrink-0 border-t border-sidebar-border">
          <ResultsPane />
        </div>
      )}
    </div>
  )
}
