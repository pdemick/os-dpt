import Anthropic from "@anthropic-ai/sdk"

import { CredentialVault } from "../credentials/vault.ts"
import { workspaceRoot } from "../workspace.ts"

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
const DEFAULT_MAX_TOKENS = 4096

export class MissingApiKeyError extends Error {
  constructor() {
    super("Anthropic API key not configured. Add one in Settings → AI providers.")
    this.name = "MissingApiKeyError"
  }
}

// Cache the key for the process lifetime so we don't round-trip the OS
// keychain on every agent step. invalidateAnthropicKey() is exported so
// the Settings UI / API can clear this when the user rotates the key.
let cachedKey: string | null = null

export async function getAnthropicKey(): Promise<string> {
  if (cachedKey) return cachedKey
  const vault = new CredentialVault(workspaceRoot())
  const key = await vault.getPassword("ai:anthropic")
  if (!key) throw new MissingApiKeyError()
  cachedKey = key
  return key
}

export function invalidateAnthropicKey(): void {
  cachedKey = null
}

export interface StreamParams {
  apiKey: string
  system: string
  messages: Anthropic.MessageParam[]
  tools: Anthropic.Tool[]
  model?: string
  maxTokens?: number
  onTextDelta?: (delta: string) => void
}

export interface StreamResult {
  message: Anthropic.Message
  model: string
  usage: Anthropic.Usage
}

export async function streamAssistantMessage(
  p: StreamParams,
): Promise<StreamResult> {
  const client = new Anthropic({ apiKey: p.apiKey })
  const model = p.model ?? DEFAULT_MODEL
  const stream = client.messages.stream({
    model,
    max_tokens: p.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: p.system,
    messages: p.messages,
    tools: p.tools,
    // One tool_use per assistant turn so the loop can cleanly handle the
    // ask_user_question pause without leaving sibling tool_use blocks
    // without matching tool_results.
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
  })
  if (p.onTextDelta) {
    stream.on("text", (delta) => p.onTextDelta?.(delta))
  }
  const message = await stream.finalMessage()
  return { message, model, usage: message.usage }
}
