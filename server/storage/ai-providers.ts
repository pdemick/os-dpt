import { promises as fs } from "node:fs"
import path from "node:path"

import type { AIProviderId } from "@shared/ai-providers.ts"

export type StoredAIProvider = {
  last4: string
  updatedAt: string
}

const FILE = "ai-providers.json"

export class AIProviderStore {
  constructor(private readonly workspace: string) {}

  private get filePath(): string {
    return path.join(this.workspace, FILE)
  }

  async get(id: AIProviderId): Promise<StoredAIProvider | null> {
    const all = await this.list()
    return all[id] ?? null
  }

  async set(id: AIProviderId, meta: StoredAIProvider): Promise<void> {
    const all = await this.list()
    all[id] = meta
    await this.write(all)
  }

  async remove(id: AIProviderId): Promise<void> {
    const all = await this.list()
    if (all[id] === null) return
    all[id] = null
    await this.write(all)
  }

  async list(): Promise<Record<AIProviderId, StoredAIProvider | null>> {
    const empty: Record<AIProviderId, StoredAIProvider | null> = {
      anthropic: null,
      openai: null,
      braintrust: null,
    }
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      const data = JSON.parse(raw) as {
        providers?: Partial<Record<AIProviderId, StoredAIProvider>>
      }
      return {
        anthropic: data.providers?.anthropic ?? null,
        openai: data.providers?.openai ?? null,
        braintrust: data.providers?.braintrust ?? null,
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty
      throw err
    }
  }

  private async write(
    providers: Record<AIProviderId, StoredAIProvider | null>,
  ): Promise<void> {
    const cleaned: Partial<Record<AIProviderId, StoredAIProvider>> = {}
    for (const [k, v] of Object.entries(providers)) {
      if (v !== null) cleaned[k as AIProviderId] = v
    }
    await fs.mkdir(this.workspace, { recursive: true })
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ providers: cleaned }, null, 2) + "\n",
      "utf8",
    )
  }
}
