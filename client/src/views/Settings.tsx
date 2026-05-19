import type * as React from "react"
import { useState } from "react"
import { SparklesIcon } from "lucide-react"

import { AIProviders } from "@/views/settings/AIProviders"
import { cn } from "@/lib/utils"

type SectionId = "ai-providers"

type Section = {
  id: SectionId
  label: string
  icon: React.ComponentType<{ className?: string }>
  render: () => React.ReactNode
}

const sections: Section[] = [
  {
    id: "ai-providers",
    label: "AI providers",
    icon: SparklesIcon,
    render: () => <AIProviders />,
  },
]

export function Settings() {
  const [active, setActive] = useState<SectionId>("ai-providers")
  const Active = sections.find((s) => s.id === active) ?? sections[0]

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-56 shrink-0 border-r border-border bg-muted/20 p-3">
        <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Settings
        </div>
        <nav className="flex flex-col gap-0.5">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                onClick={() => setActive(section.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  active === section.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span>{section.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
      <div className="flex-1 overflow-auto p-6">{Active.render()}</div>
    </div>
  )
}
