import type { Span } from "braintrust"

import { CredentialVault } from "../credentials/vault.ts"
import { workspaceRoot } from "../workspace.ts"

// Subset of Braintrust's span types we use (the full SpanType union isn't
// exported from the package).
type SpanType = "llm" | "tool" | "task" | "function"

// Braintrust tracing for the chat-to-SQL agent.
//
// Opt-in and development-oriented: a complete no-op unless a key is found.
// The key comes from the encrypted credential vault (Settings → AI providers,
// id "braintrust"), with BRAINTRUST_API_KEY as an env override for CI/one-offs.
// When enabled, each agent turn becomes a trace whose child spans are the
// individual LLM calls (full prompt in, response + token metrics out) and tool
// executions — exactly the data needed to refine prompts in the Braintrust UI.
// braintrust is an optional peer dependency: it isn't installed in a normal
// `npx os-dpt` install, so users who never enable tracing don't carry its
// (heavy) dependency tree. The SDK is loaded with a dynamic import, so a
// missing package degrades gracefully (initTracing logs an install hint)
// instead of crashing the server, and tracing-off installs pay no import cost.

type Braintrust = typeof import("braintrust")

let bt: Braintrust | null = null
let enabled = false

export function tracingEnabled(): boolean {
  return enabled
}

/** Env override wins (CI / one-offs); otherwise read the vaulted UI key. */
async function resolveApiKey(): Promise<string | null> {
  if (process.env.BRAINTRUST_API_KEY) return process.env.BRAINTRUST_API_KEY
  try {
    const vault = new CredentialVault(workspaceRoot())
    return await vault.getPassword("ai:braintrust")
  } catch {
    return null
  }
}

/**
 * Initialize tracing from the current key source. Resolves whether or not
 * tracing ends up enabled — callers don't branch on the outcome because the
 * span helpers below are no-ops when it isn't. Safe to call repeatedly; see
 * refreshTracing for re-running after the key changes at runtime.
 */
export async function initTracing(): Promise<void> {
  const apiKey = await resolveApiKey()
  if (!apiKey) {
    enabled = false
    return
  }
  const projectName = process.env.BRAINTRUST_PROJECT ?? "os-dpt"
  try {
    if (!bt) bt = await import("braintrust")
    bt.initLogger({
      projectName,
      apiKey,
      // Flush in the background so logging never adds latency to a turn.
      asyncFlush: true,
    })
    enabled = true
    console.log(`[os-dpt] Braintrust tracing enabled (project: ${projectName})`)
  } catch (err) {
    // Best-effort: tracing must never break the agent. braintrust is an
    // optional peer dependency, so the likeliest cause in a normal install is
    // that it was never installed — point the user at the fix in that case.
    const code = (err as NodeJS.ErrnoException).code
    const message =
      code === "ERR_MODULE_NOT_FOUND"
        ? "the braintrust package is not installed. Run `pnpm add braintrust` (or `npm i braintrust`) in your workspace to enable tracing."
        : (err as Error).message
    console.warn(
      "[os-dpt] Braintrust key found but tracing failed to initialize:",
      message,
    )
    bt = null
    enabled = false
  }
}

/**
 * Re-evaluate the key source and (re)configure tracing — called when the
 * Braintrust key is added/updated/removed via the AI providers UI so the
 * change takes effect without a server restart.
 */
export async function refreshTracing(): Promise<void> {
  await initTracing()
}

/**
 * Minimal span surface so call sites depend on this module rather than the
 * braintrust types, and degrade to a no-op when tracing is off.
 */
export interface TraceSpan {
  log(event: Record<string, unknown>): void
}

const NOOP_SPAN: TraceSpan = { log() {} }

export interface TraceArgs {
  name: string
  type?: SpanType
  /** Initial fields for the span (input / metadata / etc.). */
  event?: Record<string, unknown>
  /**
   * Exported parent-span handle (from startConversationSpan) to resume an
   * existing trace — used to nest each turn under one conversation trace.
   */
  parent?: string
}

/**
 * Run `fn` inside a Braintrust span. Spans nest under the currently-active
 * span via async context, so a tool/LLM span opened during an `agent.turn`
 * span becomes its child automatically. When tracing is disabled this is a
 * transparent passthrough: `fn` runs with a no-op span and identical control
 * flow, so it's safe to wrap everything unconditionally.
 */
export async function traced<T>(
  args: TraceArgs,
  fn: (span: TraceSpan) => Promise<T>,
): Promise<T> {
  if (!enabled || !bt) return fn(NOOP_SPAN)
  return bt.traced((span: Span) => fn(span as TraceSpan), {
    name: args.name,
    type: args.type,
    event: args.event,
    parent: args.parent,
  } as Parameters<Braintrust["traced"]>[1])
}

/**
 * Create a root span representing a whole conversation and return its exported
 * handle (an opaque string) to persist and reuse as the `parent` of each turn,
 * so every turn lands in one trace. The span is ended immediately — it's just
 * a container; turns attach to it later via the handle. Returns undefined when
 * tracing is disabled.
 */
export async function startConversationSpan(args: {
  name: string
  event?: Record<string, unknown>
}): Promise<string | undefined> {
  if (!enabled || !bt) return undefined
  try {
    const span = bt.startSpan({
      name: args.name,
      type: "task",
      event: args.event,
    } as Parameters<Braintrust["startSpan"]>[0])
    try {
      return await span.export()
    } finally {
      span.end()
    }
  } catch (err) {
    console.warn("[os-dpt] failed to start conversation span:", (err as Error).message)
    return undefined
  }
}

/** Flush pending spans — call on shutdown so async-flushed logs aren't lost. */
export async function flushTracing(): Promise<void> {
  if (!enabled || !bt) return
  try {
    await bt.flush()
  } catch {
    // best-effort
  }
}
