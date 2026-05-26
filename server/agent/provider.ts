import Anthropic from "@anthropic-ai/sdk"

import { CredentialVault } from "../credentials/vault.ts"
import { workspaceRoot } from "../workspace.ts"
import { traced } from "./tracing.ts"

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

const CACHE_CONTROL = { type: "ephemeral" as const }

/**
 * Cache the static prefix — the system prompt and (since they precede system
 * in the request) the tool definitions. This block is identical across every
 * step and every turn, so caching it turns ~2.3k repeated input tokens into
 * cheap cache reads.
 */
function cachedSystem(system: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: system, cache_control: CACHE_CONTROL }]
}

/**
 * Add a cache breakpoint at the end of the conversation so the whole prefix
 * (history + tool results) is cached too — this is where the tokens pile up as
 * a chat grows. Anthropic extends the cache incrementally as the breakpoint
 * moves forward each step, so prior turns still hit. Returns a shallow copy;
 * the persisted transcript is never mutated with cache_control.
 */
function withConversationCacheBreakpoint(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages
  const out = messages.slice()
  const last = out[out.length - 1]
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string"
      ? [{ type: "text", text: last.content }]
      : last.content.slice()
  if (blocks.length === 0) return messages
  // cache_control is valid on the block types we actually emit (text,
  // tool_use, tool_result); the cast sidesteps the thinking-block members of
  // the union, which we never produce.
  blocks[blocks.length - 1] = {
    ...blocks[blocks.length - 1],
    cache_control: CACHE_CONTROL,
  } as Anthropic.ContentBlockParam
  out[out.length - 1] = { ...last, content: blocks }
  return out
}

export async function streamAssistantMessage(
  p: StreamParams,
): Promise<StreamResult> {
  const client = new Anthropic({ apiKey: p.apiKey })
  const model = p.model ?? DEFAULT_MODEL
  const maxTokens = p.maxTokens ?? DEFAULT_MAX_TOKENS
  // The Braintrust LLM span captures the full prompt and response. Braintrust
  // wrapAnthropic only instruments messages.create, not the messages.stream()
  // helper we use, so we log the span explicitly — and in the canonical LLM
  // shape (system folded into input messages, token usage as metrics) so the
  // trace loads cleanly into Braintrust's prompt playground. No-op when
  // tracing is disabled.
  return traced(
    {
      name: "anthropic.messages",
      type: "llm",
      event: {
        input: [
          { role: "system", content: p.system },
          ...p.messages,
        ],
        metadata: {
          model,
          max_tokens: maxTokens,
          provider: "anthropic",
          tools: p.tools.map((t) => t.name),
        },
      },
    },
    async (span) => {
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: cachedSystem(p.system),
        messages: withConversationCacheBreakpoint(p.messages),
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
      const usage = message.usage
      // Anthropic's input_tokens counts only the uncached tail — cache reads and
      // cache-creation writes are reported separately. Fold them back in so
      // prompt_tokens/total_tokens reflect the true input; otherwise caching
      // (always on) makes these collapse to the new tail and badly under-report.
      const cachedRead = usage.cache_read_input_tokens ?? 0
      const cacheCreation = usage.cache_creation_input_tokens ?? 0
      const promptTokens = (usage.input_tokens ?? 0) + cachedRead + cacheCreation
      const completionTokens = usage.output_tokens ?? 0
      span.log({
        output: message.content,
        metadata: { stop_reason: message.stop_reason },
        metrics: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          prompt_cached_tokens: cachedRead,
          prompt_cache_creation_tokens: cacheCreation,
        },
      })
      return { message, model, usage }
    },
  )
}
