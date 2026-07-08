import type Anthropic from "@anthropic-ai/sdk"

import type { AgentEvent, AgentToolName } from "@shared/agent.ts"

import { costFromUsage } from "./pricing.ts"
import { buildSystemPrompt } from "./prompt.ts"
import {
  getAnthropicKey,
  streamAssistantMessage,
} from "./provider.ts"
import {
  appendMessage,
  clearPending,
  persistSession,
  recordUsage,
  setPending,
  type ChatSession,
} from "./session.ts"
import { anthropicToolDefs, findTool } from "./tools/index.ts"
import { startConversationSpan, traced, tracingEnabled } from "./tracing.ts"

const MAX_STEPS = 20

export type Emitter = (event: AgentEvent) => void | Promise<void>

export interface RunOptions {
  session: ChatSession
  emit: Emitter
  /**
   * Aborted when the SSE client disconnects (quick-edit cancel, closed tab).
   * The loop stops at the next safe point — before the next model call, or
   * before executing a tool — so a canceled run never runs side-effecting
   * tools (e.g. write_sql overwriting the worksheet draft) after the user
   * walked away. Un-executed tool_uses get synthesized error tool_results so
   * the persisted history stays resumable.
   */
  signal?: AbortSignal
}

function toolUseBlocks(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  )
}

/** A readable input for the turn span: the latest user message. */
function latestUserInput(session: ChatSession): unknown {
  const last = session.messages[session.messages.length - 1]
  if (!last || last.role !== "user") return null
  return last.content
}

/**
 * Resolve the conversation's trace parent, creating it on the first traced
 * turn and persisting the handle so later turns (this process or a later one)
 * resume the same trace. Returns undefined when tracing is disabled.
 */
async function conversationParent(session: ChatSession): Promise<string | undefined> {
  if (!tracingEnabled()) return undefined
  if (session.meta.traceParent) return session.meta.traceParent
  const first = session.messages.find((m) => m.role === "user")
  const handle = await startConversationSpan({
    name: "conversation",
    event: {
      input: first ? first.content : null,
      metadata: {
        chatId: session.meta.id,
        title: session.meta.title,
        worksheetSlug: session.meta.worksheetSlug,
        connectionId: session.meta.connectionId,
        standalone: session.meta.standalone,
      },
    },
  })
  if (handle) {
    session.meta.traceParent = handle
    await persistSession(session)
  }
  return handle
}

export async function runAgentTurn(opts: RunOptions): Promise<void> {
  const parent = await conversationParent(opts.session)
  return traced(
    {
      name: "agent.turn",
      type: "task",
      parent,
      event: {
        input: latestUserInput(opts.session),
        metadata: {
          chatId: opts.session.meta.id,
          worksheetSlug: opts.session.meta.worksheetSlug,
          connectionId: opts.session.meta.connectionId,
          standalone: opts.session.meta.standalone,
        },
      },
    },
    () => runTurn(opts),
  )
}

async function runTurn(opts: RunOptions): Promise<void> {
  const { session, emit, signal } = opts
  let apiKey: string
  try {
    apiKey = await getAnthropicKey()
  } catch (err) {
    await emit({ type: "error", message: (err as Error).message })
    return
  }
  const system = buildSystemPrompt(session)
  const tools = anthropicToolDefs({
    worksheetBound: !!session.meta.worksheetSlug,
    mode: session.meta.mode,
  })

  for (let step = 0; step < MAX_STEPS; step += 1) {
    // Client gone — stop before paying for another model call. History is at
    // a safe boundary here: it ends with a user message (the prompt, or the
    // previous step's tool_results).
    if (signal?.aborted) return
    let final: Anthropic.Message
    let model: string
    let usage: Anthropic.Usage
    // Anthropic's stream.on("text", cb) is a sync listener — we can't
    // await emit() inside it. Chain emits through a promise so deltas
    // are written in order, then drain the chain before continuing.
    let textEmitChain: Promise<void> = Promise.resolve()
    try {
      const result = await streamAssistantMessage({
        apiKey,
        system,
        tools,
        messages: session.messages,
        signal,
        onTextDelta: (delta) => {
          textEmitChain = textEmitChain.then(() =>
            Promise.resolve(emit({ type: "text_delta", text: delta })),
          )
        },
      })
      await textEmitChain
      final = result.message
      model = result.model
      usage = result.usage
    } catch (err) {
      // An abort mid-generation isn't a failure: the partial assistant
      // message is discarded and nothing was appended, so history still ends
      // with a user message.
      if (signal?.aborted) return
      await emit({ type: "error", message: (err as Error).message })
      return
    }

    await appendMessage(session, { role: "assistant", content: final.content })

    const entry = {
      at: new Date().toISOString(),
      model,
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      costUsd: costFromUsage(model, usage),
    }
    await recordUsage(session, entry)
    await emit({ type: "usage", entry, totals: session.meta.totals })

    const toolUses = toolUseBlocks(final)
    if (toolUses.length === 0) {
      await emit({ type: "done" })
      return
    }

    // We rely on the model emitting one tool_use per turn (configured
    // via disable_parallel_tool_use in provider.ts). If multiple slip
    // through, execute them sequentially in the same step.
    const resultBlocks: Anthropic.ToolResultBlockParam[] = []
    let paused: { toolUseId: string; question: string } | null = null

    for (const block of toolUses) {
      const tool = findTool(block.name)
      if (!tool) {
        await emit({
          type: "tool_result",
          toolUseId: block.id,
          name: block.name as AgentToolName,
          ok: false,
          summary: `Unknown tool: ${block.name}`,
        })
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        })
        continue
      }

      // A disconnect between the model call and here must not run
      // side-effecting tools (a canceled quick-edit run would otherwise still
      // overwrite the worksheet draft via write_sql). Answer the tool_use
      // with a synthesized error result so the transcript stays valid.
      if (signal?.aborted) {
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Canceled: the user aborted this run before the tool executed.",
          is_error: true,
        })
        continue
      }

      await emit({
        type: "tool_start",
        toolUseId: block.id,
        name: tool.name,
        input: block.input,
      })

      let execution
      try {
        execution = await traced(
          {
            name: `tool.${tool.name}`,
            type: "tool",
            event: { input: block.input },
          },
          async (span) => {
            const result = await tool.execute(block.input, { session })
            span.log({
              output: result.toolResult,
              metadata: { isError: result.isError, summary: result.uiSummary },
            })
            return result
          },
        )
      } catch (err) {
        const message = (err as Error).message
        await emit({
          type: "tool_result",
          toolUseId: block.id,
          name: tool.name,
          ok: false,
          summary: `${tool.name} threw: ${message}`,
        })
        resultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Tool threw: ${message}`,
          is_error: true,
        })
        continue
      }

      if (execution.events) {
        for (const e of execution.events) await emit(e)
      }
      await emit({
        type: "tool_result",
        toolUseId: block.id,
        name: tool.name,
        ok: !execution.isError,
        summary: execution.uiSummary,
      })

      resultBlocks.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: execution.toolResult,
        is_error: execution.isError,
      })

      if (execution.pause) {
        paused = {
          toolUseId: block.id,
          question: execution.pause.question,
        }
      }
    }

    // Persist all tool_results in one user message (Anthropic requires
    // every tool_use in an assistant turn to be answered together).
    await appendMessage(session, { role: "user", content: resultBlocks })

    if (paused) {
      await setPending(session, {
        toolUseId: paused.toolUseId,
        question: paused.question,
        askedAt: new Date().toISOString(),
      })
      await emit({
        type: "ask_user",
        toolUseId: paused.toolUseId,
        question: paused.question,
      })
      return
    }
  }

  await emit({
    type: "error",
    message: `Agent exceeded ${MAX_STEPS} steps without finishing.`,
  })
}

export interface ResumeOptions {
  session: ChatSession
  userAnswer: string
  emit: Emitter
  /** See RunOptions.signal. */
  signal?: AbortSignal
}

/**
 * Replace the placeholder tool_result for the pending ask_user_question
 * with the user's actual answer, then resume the loop.
 */
export async function resumeWithAnswer(opts: ResumeOptions): Promise<void> {
  const { session, userAnswer, emit, signal } = opts
  const pending = session.meta.pending
  if (!pending) {
    await emit({ type: "error", message: "No pending question to resume." })
    return
  }
  const last = session.messages[session.messages.length - 1]
  if (last && last.role === "user" && Array.isArray(last.content)) {
    for (const block of last.content) {
      if (
        block.type === "tool_result" &&
        block.tool_use_id === pending.toolUseId
      ) {
        block.content = `User answered: ${userAnswer}`
        block.is_error = false
      }
    }
  }
  // Flush the message-block mutation explicitly so the on-disk transcript
  // reflects the user's answer even if clearPending is later refactored
  // to skip its persist, or if runAgentTurn is invoked first.
  await persistSession(session)
  await clearPending(session)
  await runAgentTurn({ session, emit, signal })
}
