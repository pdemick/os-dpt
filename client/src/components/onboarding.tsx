import { useCallback, useEffect, useState } from "react"
import type * as React from "react"
import {
  ActivityIcon,
  CheckIcon,
  DatabaseIcon,
  KeyRoundIcon,
} from "lucide-react"

import type { AIProvider } from "@shared/ai-providers.ts"
import type { Connection } from "@shared/connections.ts"

import { AddConnectionDialog } from "@/components/add-connection-dialog"
import { AIProviderDialog } from "@/components/ai-provider-dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

// First-run setup screen, shown by App when the workspace is fresh (no
// connections and no configured AI provider). Steps complete in any order;
// only the first two gate the primary button.
export function Onboarding({ onFinished }: { onFinished: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(
    null,
  )
  // When the provider list can't load, the key steps are stuck disabled with
  // no way past them but "Skip for now" — so surface the failure and a retry.
  const [providersError, setProvidersError] = useState<string | null>(null)

  const loadProviders = useCallback(() => {
    return api
      .listAIProviders()
      .catch(() => null)
      .then((result) => {
        if (result?.ok) {
          setProviders(result.data.providers)
          setProvidersError(null)
        } else {
          setProvidersError(
            result ? result.error : "Could not reach the local server.",
          )
        }
      })
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const anthropic = providers.find((p) => p.id === "anthropic")
  const braintrust = providers.find((p) => p.id === "braintrust")

  const hasConnection = connections.length > 0
  const hasAnthropicKey = anthropic?.configured ?? false

  const handleConnectionSaved = (connection: Connection) => {
    setConnections((prev) => [...prev, connection])
  }

  const handleProviderSaved = (provider: AIProvider) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === provider.id ? provider : p)),
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <DatabaseIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Welcome to Data Profile Tool</h1>
            <p className="text-sm text-muted-foreground">
              A couple of steps and you're ready to query.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Step
            number={1}
            done={hasConnection}
            icon={DatabaseIcon}
            title="Connect a database"
            description="Add a Postgres connection. Read-only by default; credentials are stored encrypted on this machine."
            action={hasConnection ? "Add another" : "New connection"}
            onAction={() => setConnectionDialogOpen(true)}
          />
          <Step
            number={2}
            done={hasAnthropicKey}
            icon={KeyRoundIcon}
            title="Add your Anthropic API key"
            description={
              <>
                Powers the chat-to-SQL agent. Get one at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  console.anthropic.com
                </a>
                .
              </>
            }
            action={hasAnthropicKey ? "Update key" : "Add key"}
            actionDisabled={!anthropic}
            onAction={() => setEditingProvider(anthropic ?? null)}
          />
          <Step
            number={3}
            done={braintrust?.configured ?? false}
            optional
            icon={ActivityIcon}
            title="Add a Braintrust key"
            description="Trace agent runs to inspect and refine prompts. Tracing stays off until a key is set."
            action={braintrust?.configured ? "Update key" : "Add key"}
            actionDisabled={!braintrust}
            onAction={() => setEditingProvider(braintrust ?? null)}
          />
        </div>

        {providersError && (
          <p className="text-center text-sm text-destructive">
            Couldn't check AI provider status: {providersError}{" "}
            <button
              type="button"
              onClick={() => void loadProviders()}
              className="underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        )}

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onFinished}>
            Skip for now
          </Button>
          <Button
            onClick={onFinished}
            disabled={!hasConnection || !hasAnthropicKey}
          >
            Open Data Profile Tool
          </Button>
        </div>
      </div>

      <AddConnectionDialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
        onSaved={handleConnectionSaved}
      />

      <AIProviderDialog
        provider={editingProvider}
        onOpenChange={(open) => {
          if (!open) setEditingProvider(null)
        }}
        onSaved={handleProviderSaved}
      />
    </div>
  )
}

function Step({
  number,
  done,
  optional,
  icon: Icon,
  title,
  description,
  action,
  actionDisabled,
  onAction,
}: {
  number: number
  done: boolean
  optional?: boolean
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: React.ReactNode
  action: string
  actionDisabled?: boolean
  onAction: () => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
          done
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <CheckIcon className="size-4" /> : number}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {optional && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Optional
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button
        size="sm"
        variant={done ? "outline" : "default"}
        onClick={onAction}
        disabled={actionDisabled}
      >
        {action}
      </Button>
    </div>
  )
}
