import { useEffect, useRef, useState } from "react"
import { FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { useWorksheets } from "@/hooks/use-worksheets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function WorksheetSidebar() {
  const { list, session, openTab, deleteWorksheet, createWorksheet, renameWorksheet } =
    useWorksheets()
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingSlug && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingSlug])

  const startEdit = (slug: string, name: string) => {
    setEditingSlug(slug)
    setEditValue(name)
  }

  const commitEdit = async () => {
    const slug = editingSlug
    if (!slug) return
    const next = editValue.trim()
    setEditingSlug(null)
    if (next) await renameWorksheet(slug, next)
  }

  const cancelEdit = () => {
    setEditingSlug(null)
    setEditValue("")
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
          Worksheets
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          aria-label="New worksheet"
          onClick={() => void createWorksheet()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
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
              const isEditing = editingSlug === meta.slug
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
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2 px-3 py-1">
                      <FileText className="size-3.5 shrink-0 opacity-60" />
                      <Input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => void commitEdit()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            void commitEdit()
                          } else if (e.key === "Escape") {
                            e.preventDefault()
                            cancelEdit()
                          }
                        }}
                        className="h-6 px-1 text-xs"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openTab(meta.slug)}
                      onDoubleClick={() => startEdit(meta.slug, meta.name)}
                      title={meta.slug}
                      className="flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs"
                    >
                      <FileText className="size-3.5 shrink-0 opacity-60" />
                      <span className="flex-1 truncate">{meta.name}</span>
                    </button>
                  )}
                  {!isEditing && (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(meta.slug, meta.name)}
                        className="size-5 opacity-0 group-hover:opacity-60 hover:opacity-100"
                        aria-label={`Rename ${meta.name}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => void deleteWorksheet(meta.slug)}
                        className="size-5 opacity-0 group-hover:opacity-60 hover:opacity-100"
                        aria-label={`Delete ${meta.name}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
