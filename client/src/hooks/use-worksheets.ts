import { useContext } from "react"
import { WorksheetsContext } from "@/lib/worksheets/context-object"

export function useWorksheets() {
  const ctx = useContext(WorksheetsContext)
  if (!ctx) throw new Error("useWorksheets must be used inside <WorksheetsProvider>")
  return ctx
}
