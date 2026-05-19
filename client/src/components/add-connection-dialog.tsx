import { useRef, useState } from "react"
import type { ReactNode } from "react"

import type { Connection, NewConnectionInput } from "@shared/connections.ts"

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
import { api } from "@/lib/api"

type FormState = {
  name: string
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
}

const emptyForm: FormState = {
  name: "",
  host: "localhost",
  port: "5432",
  database: "",
  user: "",
  password: "",
  ssl: false,
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
