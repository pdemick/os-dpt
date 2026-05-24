import { useId, useRef, useState } from "react"
import type { ReactNode } from "react"

import type { AccessMode, Connection, NewConnectionInput } from "@shared/connections.ts"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"

type FormState = {
  name: string
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
  accessMode: AccessMode
}

const emptyForm: FormState = {
  name: "",
  host: "localhost",
  port: "5432",
  database: "",
  user: "",
  password: "",
  ssl: false,
  accessMode: "read-write",
}

function toInput(form: FormState): NewConnectionInput {
  return {
    name: form.name.trim(),
    driver: "postgres",
    host: form.host.trim(),
    port: Number(form.port),
    database: form.database.trim(),
    user: form.user.trim(),
    password: form.password,
    ssl: form.ssl,
    accessMode: form.accessMode,
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (connection: Connection) => void
}

export function AddConnectionDialog({ open, onOpenChange, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState<"test" | "save" | null>(null)
  const [message, setMessage] = useState<
    { kind: "error" | "success"; text: string } | null
  >(null)
  // Bumped on close so in-flight requests skip applying their result.
  const generationRef = useRef(0)

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const reset = () => {
    setForm(emptyForm)
    setMessage(null)
    setBusy(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      generationRef.current += 1
      reset()
    }
    onOpenChange(next)
  }

  const handleTest = async () => {
    const gen = generationRef.current
    setBusy("test")
    setMessage(null)
    const result = await api.testConnection(toInput(form))
    if (gen !== generationRef.current) return
    setBusy(null)
    if (result.ok) setMessage({ kind: "success", text: "Connection succeeded." })
    else setMessage({ kind: "error", text: result.error })
  }

  const handleSave = async () => {
    const gen = generationRef.current
    setBusy("save")
    setMessage(null)
    const result = await api.createConnection(toInput(form))
    if (gen !== generationRef.current) return
    setBusy(null)
    if (result.ok) {
      onCreated(result.data.connection)
      handleOpenChange(false)
    } else {
      setMessage({ kind: "error", text: result.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Postgres connection</DialogTitle>
          <DialogDescription>
            Credentials are encrypted with a key in your OS keychain and stored in{" "}
            <code>.os-dpt/credentials.enc</code>.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <Field label="Name" htmlFor="conn-name">
            <Input
              id="conn-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="prod-readonly"
              required
            />
          </Field>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Host" htmlFor="conn-host">
              <Input
                id="conn-host"
                value={form.host}
                onChange={(e) => update("host", e.target.value)}
                required
              />
            </Field>
            <Field label="Port" htmlFor="conn-port">
              <Input
                id="conn-port"
                value={form.port}
                onChange={(e) => update("port", e.target.value)}
                inputMode="numeric"
                required
              />
            </Field>
          </div>

          <Field label="Database" htmlFor="conn-db">
            <Input
              id="conn-db"
              value={form.database}
              onChange={(e) => update("database", e.target.value)}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="User" htmlFor="conn-user">
              <Input
                id="conn-user"
                value={form.user}
                onChange={(e) => update("user", e.target.value)}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Password" htmlFor="conn-password">
              <Input
                id="conn-password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => update("ssl", e.target.checked)}
            />
            Use SSL
          </label>

          <Field label="Access" htmlFor="conn-access">
            <AccessModeToggle
              id="conn-access"
              value={form.accessMode}
              onChange={(mode) => update("accessMode", mode)}
            />
            <p className="text-xs text-muted-foreground">
              {form.accessMode === "read-only"
                ? "Guards against accidental writes — sessions open read-only by default."
                : "Queries can read and modify data."}
            </p>
          </Field>

          {message && (
            <p
              className={
                message.kind === "error"
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {message.text}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={busy !== null}
            >
              {busy === "test" ? "Testing…" : "Test"}
            </Button>
            <Button type="submit" disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

// Switch for picking a connection's access mode. On = write access
// (read-write, the default); off = read-only. Framed positively so flipping
// the switch on grants a capability rather than imposing a restriction. Shared
// by the add dialog and the connection list so both read the same way.
export function AccessModeToggle({
  value,
  onChange,
  disabled,
  id: idProp,
}: {
  value: AccessMode
  onChange: (mode: AccessMode) => void
  disabled?: boolean
  // Optional so a wrapping <Field> label can associate with the switch; falls
  // back to a generated id when used standalone (e.g. the connection list row).
  id?: string
}) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={value === "read-write"}
        onCheckedChange={(checked) => onChange(checked ? "read-write" : "read-only")}
        disabled={disabled}
      />
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        Write access
      </Label>
    </div>
  )
}
