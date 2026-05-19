import { X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useWorksheets } from "@/hooks/use-worksheets"
import { cn } from "@/lib/utils"

export function WorksheetTabs() {
  const { session, setActive, closeTab, dirty } = useWorksheets()
  if (session.openTabs.length === 0) return null
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
              <TabsTrigger
                value={tab.slug}
                className={cn(
                  "relative h-full flex-none rounded-none border-transparent! bg-transparent! px-3 py-0 font-mono text-xs",
                  "data-active:bg-transparent data-active:text-foreground",
                  "after:content-none",
                )}
              >
                {tab.slug}
                <span
                  className={cn(
                    "ml-1 inline-flex size-1.5 rounded-full transition-opacity",
                    isDirty ? "bg-orange-500 opacity-100" : "opacity-0",
                  )}
                />
              </TabsTrigger>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.slug)
                }}
                className="mr-1 size-5 hover:bg-transparent opacity-0 group-hover:opacity-60 hover:opacity-100"
                aria-label={`Close ${tab.slug}`}
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
