import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { DatabaseIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import type { AccessMode, Connection } from "@shared/connections.ts"

import {
  AccessModeToggle,
  AddConnectionDialog,
} from "@/components/add-connection-dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { useAppIntent } from "@/lib/app-intents"

export function Connections() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // The connection being edited, or null when adding a new one.
  const [editing, setEditing] = useState<Connection | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    const result = await api.listConnections()
    if (result.ok) setConnections(result.data.connections)
    else setError(result.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openAdd = useCallback(() => {
    setEditing(null)
    setDialogOpen(true)
  }, [])

  const openEdit = (connection: Connection) => {
    setEditing(connection)
    setDialogOpen(true)
  }

  // "New connection" quick action opens the add dialog once mounted here.
  useAppIntent("new-connection", openAdd)

  const handleSaved = (connection: Connection) => {
    setConnections((prev) =>
      prev.some((c) => c.id === connection.id)
        ? // Edit: replace in place so the row keeps its position.
          prev.map((c) => (c.id === connection.id ? connection : c))
        : // New: append.
          [...prev, connection],
    )
  }

  const handleConnect = async (id: string) => {
    setBusyId(id)
    const result = await api.connect(id)
    setBusyId(null)
    if (!result.ok || result.data.ok === false) {
      const msg = !result.ok
        ? result.error
        : (result.data.error ?? "Failed to connect")
      setError(msg)
      return
    }
    void refresh()
  }

  const handleDisconnect = async (id: string) => {
    setBusyId(id)
    await api.disconnect(id)
    setBusyId(null)
    void refresh()
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    const result = await api.deleteConnection(id)
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setConnections((prev) => prev.filter((c) => c.id !== id))
  }

  const handleAccessMode = async (id: string, accessMode: AccessMode) => {
    setBusyId(id)
    setError(null)
    const result = await api.updateConnection(id, { accessMode })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error)
    }
    // Refresh regardless of outcome: the server persists the new mode before
    // recreating the pool, so even on a failed reconnect (which drops the pool)
    // the stored mode and active state have changed. Skipping the refresh would
    // leave the row showing the old mode and a stale "active" badge.
    void refresh()
  }

  const active = connections.filter((c) => c.active)
  const saved = connections.filter((c) => !c.active)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage database connections in this workspace.
          </p>
        </div>
        <Button onClick={openAdd}>
          <PlusIcon />
          New connection
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : connections.length === 0 ? (
        <EmptyState onAdd={openAdd} />
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Active" count={active.length}>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active connections.
              </p>
            ) : (
              active.map((conn) => (
                <ConnectionRow
                  key={conn.id}
                  conn={conn}
                  busy={busyId === conn.id}
                  onDisconnect={() => handleDisconnect(conn.id)}
                  onEdit={() => openEdit(conn)}
                  onDelete={() => handleDelete(conn.id)}
                  onAccessMode={(mode) => handleAccessMode(conn.id, mode)}
                />
              ))
            )}
          </Section>

          <Section title="Saved" count={saved.length}>
            {saved.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved connections.
              </p>
            ) : (
              saved.map((conn) => (
                <ConnectionRow
                  key={conn.id}
                  conn={conn}
                  busy={busyId === conn.id}
                  onConnect={() => handleConnect(conn.id)}
                  onEdit={() => openEdit(conn)}
                  onDelete={() => handleDelete(conn.id)}
                  onAccessMode={(mode) => handleAccessMode(conn.id, mode)}
                />
              ))
            )}
          </Section>
        </div>
      )}

      <AddConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        connection={editing ?? undefined}
      />
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

type RowProps = {
  conn: Connection
  busy: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onEdit: () => void
  onDelete: () => void
  onAccessMode: (mode: AccessMode) => void
}

function ConnectionRow({
  conn,
  busy,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onAccessMode,
}: RowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <DatabaseIcon />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {conn.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {conn.driver} · {conn.user}@{conn.host}:{conn.port}/{conn.database}
          {conn.ssl ? " · ssl" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AccessModeToggle
          value={conn.accessMode}
          onChange={onAccessMode}
          disabled={busy}
        />
        {conn.active ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onDisconnect}
            disabled={busy}
          >
            {busy ? "…" : "Disconnect"}
          </Button>
        ) : (
          <Button size="sm" onClick={onConnect} disabled={busy}>
            {busy ? "…" : "Connect"}
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
          disabled={busy}
          aria-label={`Edit ${conn.name}`}
        >
          <PencilIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${conn.name}`}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
      <DatabaseIcon className="size-8 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium text-foreground">
          No connections yet
        </p>
        <p className="text-sm text-muted-foreground">
          Add a Postgres connection to start querying.
        </p>
      </div>
      <Button onClick={onAdd}>
        <PlusIcon />
        New connection
      </Button>
    </div>
  )
}
