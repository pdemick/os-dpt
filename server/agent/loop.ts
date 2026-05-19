import type Anthropic from "@anthropic-ai/sdk"

import type { AgentEvent, AgentToolName } from "@shared/agent.ts"

import { buildSystemPrompt } from "./prompt.ts"
import {
  getAnthropicKey,
  streamAssistantMessage,
} from "./provider.ts"
import {
  appendMessage,
  clearPending,
  persistSession,
  setPending,
  type ChatSession,
} from "./session.ts"
import { anthropicToolDefs, findTool } from "./tools/index.ts"

const MAX_STEPS = 20

export type Emitter = (event: AgentEvent) => void | Promise<void>

export interface RunOptions {
  session: ChatSession
  emit: Emitter
}

function toolUseBlocks(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  )
}

export async function runAgentTurn(opts: RunOptions): Promise<void> {
  const { session, emit } = opts
  let apiKey: string
  try {
    apiKey = await getAnthropicKey()
  } catch (err) {
    await emit({ type: "error", message: (err as Error).message })
    return
  }
  const system = buildSystemPrompt(session)
  const tools = anthropicToolDefs()

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let final: Anthropic.Message
    // Anthropic's stream.on("text", cb) is a sync listener — we can't
    // await emit() inside it. Chain emits through a promise so deltas
    // are written in order, then drain the chain before continuing.
    let textEmitChain: Promise<void> = Promise.resolve()
    try {
      final = await streamAssistantMessage({
        apiKey,
        system,
        tools,
        messages: session.messages,
        onTextDelta: (delta) => {
          textEmitChain = textEmitChain.then(() =>
            Promise.resolve(emit({ type: "text_delta", text: delta })),
          )
        },
      })
      await textEmitChain
    } catch (err) {
      await emit({ type: "error", message: (err as Error).message })
      return
    }

    await appendMessage(session, { role: "assistant", content: final.content })

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

      await emit({
        type: "tool_start",
        toolUseId: block.id,
        name: tool.name,
        input: block.input,
      })

      let execution
      try {
        execution = await tool.execute(block.input, { session })
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
}

/**
 * Replace the placeholder tool_result for the pending ask_user_question
 * with the user's actual answer, then resume the loop.
 */
export async function resumeWithAnswer(opts: ResumeOptions): Promise<void> {
  const { session, userAnswer, emit } = opts
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
  await runAgentTurn({ session, emit })
}
