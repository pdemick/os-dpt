import type { AgentTool } from "./index.ts"

interface Input {
  question?: string
}

export const askUserQuestionTool: AgentTool = {
  name: "ask_user_question",
  description:
    "Ask the user a clarifying question when you lack context to proceed safely. " +
    "Calling this PAUSES the agent — no further tools run this turn and the user is prompted to reply. " +
    "Use it for genuine ambiguity (which table did they mean, what time window, etc.), not for confirmation of obvious next steps.",
  input_schema: {
    type: "object",
    required: ["question"],
    properties: {
      question: {
        type: "string",
        description: "One specific question, phrased plainly.",
      },
    },
  },
  async execute(rawInput) {
    const input = (rawInput ?? {}) as Input
    const question =
      typeof input.question === "string" ? input.question.trim() : ""
    if (question === "") {
      return {
        toolResult: "Invalid question: must be non-empty string",
        isError: true,
        uiSummary: "ask_user_question: empty",
      }
    }
    // The loop reads `pause` and handles persisting + closing SSE; the
    // `toolResult` is what we'll replace with the user's eventual answer.
    return {
      toolResult: "(awaiting user response)",
      isError: false,
      uiSummary: question,
      pause: { question },
    }
  },
}
