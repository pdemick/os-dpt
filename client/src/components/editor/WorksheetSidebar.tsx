import { useState } from "react"
import { FileText, Plus, Trash2 } from "lucide-react"
import { useWorksheets } from "@/hooks/use-worksheets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function WorksheetSidebar() {
  const { list, session, openTab, deleteWorksheet, createWorksheet } = useWorksheets()
  const [newName, setNewName] = useState("")
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
          Worksheets
        </span>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New worksheet</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newName.trim()) return
                await createWorksheet(newName.trim())
                setNewName("")
                setNewOpen(false)
              }}
            >
              <Input
                autoFocus
                placeholder="query name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <DialogFooter className="mt-3">
                <Button type="submit" disabled={!newName.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <ScrollArea className="flex-1">
        {list.length === 0 ? (
          <div className="p-4 text-xs text-sidebar-foreground/60">
            No worksheets yet. Click + to create one.
          </div>
        ) : (
          <ul className="py-1">
            {list.map((meta) => {
              const isActive = session.activeSlug === meta.slug
              return (
                <li
                  key={meta.slug}
                  className={cn(
                    "group flex items-center gap-1 pr-1 transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openTab(meta.slug)}
                    className="flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs"
                  >
                    <FileText className="size-3.5 shrink-0 opacity-60" />
                    <span className="flex-1 truncate font-mono">{meta.slug}</span>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => void deleteWorksheet(meta.slug)}
                    className="size-5 opacity-0 group-hover:opacity-60 hover:opacity-100"
                    aria-label={`Delete ${meta.slug}`}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
