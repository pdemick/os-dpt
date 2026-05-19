import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWorksheets } from "@/hooks/use-worksheets"
import { cn } from "@/lib/utils"

export function WorksheetTabs() {
  const { session, files, setActive, closeTab, dirty, renameWorksheet } = useWorksheets()
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingSlug && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingSlug])

  if (session.openTabs.length === 0) return null

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
    <Tabs
      value={session.activeSlug ?? undefined}
      onValueChange={setActive}
      className="border-b border-sidebar-border bg-sidebar"
    >
      <TabsList
        variant="line"
        className="h-9 w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0"
      >
        {session.openTabs.map((tab) => {
          const isDirty = dirty(tab.slug)
          const isActive = session.activeSlug === tab.slug
          const isEditing = editingSlug === tab.slug
          const name = files[tab.slug]?.meta.name ?? tab.slug
          return (
            <div
              key={tab.slug}
              data-active={isActive ? "" : undefined}
              className={cn(
                "group flex h-full items-center border-r border-sidebar-border transition-colors",
                isActive
                  ? "bg-background text-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(tab.slug)
                }
              }}
            >
              {isEditing ? (
                <div className="flex h-full items-center px-2">
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
                <TabsTrigger
                  value={tab.slug}
                  onDoubleClick={() => startEdit(tab.slug, name)}
                  title={tab.slug}
                  className={cn(
                    "relative h-full flex-none rounded-none border-transparent! bg-transparent! px-3 py-0 text-xs",
                    "data-active:bg-transparent data-active:text-foreground",
                    "after:content-none",
                  )}
                >
                  {name}
                  <span
                    className={cn(
                      "ml-1 inline-flex size-1.5 rounded-full transition-opacity",
                      isDirty ? "bg-orange-500 opacity-100" : "opacity-0",
                    )}
                  />
                </TabsTrigger>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.slug)
                }}
                className="mr-1 size-5 hover:bg-transparent opacity-0 group-hover:opacity-60 hover:opacity-100"
                aria-label={`Close ${name}`}
              >
                <X className="size-3" />
              </Button>
            </div>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
