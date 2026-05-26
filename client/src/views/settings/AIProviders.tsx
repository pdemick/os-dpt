import { useCallback, useEffect, useState } from "react"
import { CheckIcon, PencilIcon, Trash2Icon } from "lucide-react"

import type { AIProvider } from "@shared/ai-providers.ts"

import { AIProviderDialog } from "@/components/ai-provider-dialog"
import { ProviderIcon } from "@/components/provider-icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"

export function AIProviders() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AIProvider | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AIProvider | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    const result = await api.listAIProviders()
    if (result.ok) setProviders(result.data.providers)
    else setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSaved = (provider: AIProvider) => {
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? provider : p)))
  }

  const handleDelete = async (provider: AIProvider) => {
    setBusyId(provider.id)
    const result = await api.deleteAIProviderKey(provider.id)
    setBusyId(null)
    setPendingDelete(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setProviders((prev) =>
      prev.map((p) => (p.id === provider.id ? result.data.provider : p)),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">AI providers</h1>
        <p className="text-sm text-muted-foreground">
          Set local API keys for AI providers. Stored encrypted in{" "}
          <code>.os-dpt/credentials.enc</code> using a key in your OS keychain.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ProviderSection
        title="Model providers"
        providers={providers.filter((p) => p.kind === "model")}
        loading={loading}
        busyId={busyId}
        onEdit={setEditing}
        onDelete={setPendingDelete}
      />

      <ProviderSection
        title="Observability"
        description="Trace agent runs to refine prompts. Optional — tracing is off until a key is set."
        providers={providers.filter((p) => p.kind === "observability")}
        loading={loading}
        busyId={busyId}
        onEdit={setEditing}
        onDelete={setPendingDelete}
      />

      <AIProviderDialog
        provider={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={handleSaved}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {pendingDelete?.label} key?
            </DialogTitle>
            <DialogDescription>
              The encrypted key will be removed from{" "}
              <code>.os-dpt/credentials.enc</code>. Local agents that rely on{" "}
              <code>{pendingDelete?.envVar}</code> will stop working until a new
              key is added.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={busyId === pendingDelete?.id}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingDelete) void handleDelete(pendingDelete)
              }}
              disabled={busyId === pendingDelete?.id}
            >
              {busyId === pendingDelete?.id ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type SectionProps = {
  title: string
  description?: string
  providers: AIProvider[]
  loading: boolean
  busyId: string | null
  onEdit: (provider: AIProvider) => void
  onDelete: (provider: AIProvider) => void
}

function ProviderSection({
  title,
  description,
  providers,
  loading,
  busyId,
  onEdit,
  onDelete,
}: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Name</span>
          <span>Status</span>
          <span>Secret</span>
          <span>Last updated</span>
          <span className="sr-only">Actions</span>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : (
          providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              busy={busyId === provider.id}
              onEdit={() => onEdit(provider)}
              onDelete={() => onDelete(provider)}
            />
          ))
        )}
      </div>
    </section>
  )
}

type RowProps = {
  provider: AIProvider
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}

function ProviderRow({ provider, busy, onEdit, onDelete }: RowProps) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
          <ProviderIcon provider={provider.id} className="size-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {provider.label}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {provider.envVar}
          </span>
        </div>
      </div>

      <div className="text-sm">
        {provider.configured ? (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <CheckIcon className="size-4 text-emerald-500" />
            Configured
          </span>
        ) : (
          <span className="text-muted-foreground">Not configured</span>
        )}
      </div>

      <div className="font-mono text-xs text-muted-foreground">
        {provider.configured ? `…${provider.last4}` : "—"}
      </div>

      <div className="text-xs text-muted-foreground">
        {provider.updatedAt ? formatDate(provider.updatedAt) : "—"}
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
          disabled={busy}
          aria-label={`Edit ${provider.label} key`}
        >
          <PencilIcon className="size-4" />
        </Button>
        {provider.configured && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Delete ${provider.label} key`}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
