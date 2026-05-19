import { useEffect, useState } from "react"

import type { AIProvider } from "@shared/ai-providers.ts"

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

type Props = {
  provider: AIProvider | null
  onOpenChange: (open: boolean) => void
  onSaved: (provider: AIProvider) => void
}

export function AIProviderDialog({ provider, onOpenChange, onSaved }: Props) {
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState<"test" | "save" | null>(null)
  const [message, setMessage] = useState<
    { kind: "error" | "success"; text: string } | null
  >(null)

  useEffect(() => {
    if (provider) {
      setApiKey("")
      setMessage(null)
      setBusy(null)
    }
  }, [provider])

  if (!provider) return null

  const handleTest = async () => {
    setBusy("test")
    setMessage(null)
    const result = await api.testAIProviderKey(provider.id, apiKey)
    setBusy(null)
    if (result.ok && result.data.ok) {
      setMessage({ kind: "success", text: "Key verified." })
    } else if (result.ok && !result.data.ok) {
      setMessage({ kind: "error", text: result.data.error })
    } else if (!result.ok) {
      setMessage({ kind: "error", text: result.error })
    }
  }

  const handleSave = async () => {
    setBusy("save")
    setMessage(null)
    const result = await api.setAIProviderKey(provider.id, apiKey)
    setBusy(null)
    if (result.ok) {
      onSaved(result.data.provider)
      onOpenChange(false)
    } else {
      setMessage({ kind: "error", text: result.error })
    }
  }

  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {provider.configured ? "Update" : "Add"} {provider.label} key
          </DialogTitle>
          <DialogDescription>
            Stored encrypted in <code>.os-dpt/credentials.enc</code> and exposed
            to local agents as <code>{provider.envVar}</code>.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ai-key">API key</Label>
            <Input
              id="ai-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              placeholder={
                provider.configured ? `Replace existing …${provider.last4}` : ""
              }
              required
            />
          </div>

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
              disabled={busy !== null || apiKey === ""}
            >
              {busy === "test" ? "Testing…" : "Test"}
            </Button>
            <Button type="submit" disabled={busy !== null || apiKey === ""}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
