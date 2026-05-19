import crypto from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import keytar from "keytar"

import { getOrCreateWorkspaceId } from "./workspaceId.ts"

const SERVICE = "os-dpt"
const FILE = path.join(".os-dpt", "credentials.enc")

type Entry = { iv: string; ciphertext: string; tag: string }
type Blob = { entries: Record<string, Entry> }

/**
 * Per-workspace master key in OS keychain (keyed by a stable workspace
 * UUID stored at `.os-dpt/workspace-id`, so the key survives the
 * workspace being moved or accessed via a symlink). Per-connection
 * passwords are AES-256-GCM-encrypted into `.os-dpt/credentials.enc`.
 */
export class CredentialVault {
  constructor(private readonly workspace: string) {}

  // Serializes read-modify-write cycles so concurrent setPassword /
  // deletePassword calls don't clobber each other.
  private queue: Promise<unknown> = Promise.resolve()

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => {})
    return next
  }

  private get filePath(): string {
    return path.join(this.workspace, FILE)
  }

  private async account(): Promise<string> {
    const id = await getOrCreateWorkspaceId(this.workspace)
    return `workspace:${id}`
  }

  setPassword(connectionId: string, password: string): Promise<void> {
    return this.enqueue(async () => {
      const key = await this.masterKey()
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
      const ciphertext = Buffer.concat([
        cipher.update(password, "utf8"),
        cipher.final(),
      ])
      const tag = cipher.getAuthTag()

      const blob = await this.read()
      blob.entries[connectionId] = {
        iv: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        tag: tag.toString("base64"),
      }
      await this.persist(blob)
    })
  }

  async getPassword(connectionId: string): Promise<string | null> {
    const blob = await this.read()
    const entry = blob.entries[connectionId]
    if (!entry) return null
    const key = await this.masterKey()
    const iv = Buffer.from(entry.iv, "base64")
    const ciphertext = Buffer.from(entry.ciphertext, "base64")
    const tag = Buffer.from(entry.tag, "base64")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    )
  }

  deletePassword(connectionId: string): Promise<void> {
    return this.enqueue(async () => {
      const blob = await this.read()
      if (!(connectionId in blob.entries)) return
      delete blob.entries[connectionId]
      await this.persist(blob)
    })
  }

  private async masterKey(): Promise<Buffer> {
    const account = await this.account()
    const existing = await keytar.getPassword(SERVICE, account)
    if (existing) return Buffer.from(existing, "base64")
    const fresh = crypto.randomBytes(32)
    await keytar.setPassword(SERVICE, account, fresh.toString("base64"))
    return fresh
  }

  private async read(): Promise<Blob> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      const data = JSON.parse(raw) as Blob
      return { entries: data.entries ?? {} }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { entries: {} }
      throw err
    }
  }

  private async persist(blob: Blob): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(blob, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    })
  }
}
