import Anthropic from "@anthropic-ai/sdk"

import { getAnthropicKey } from "./provider.ts"

const NAMING_MODEL = "claude-haiku-4-5-20251001"
const MAX_INPUT_CHARS = 2000
const MAX_NAME_CHARS = 60

const SQL_SYSTEM_PROMPT =
  "You name SQL queries. Given a SQL snippet, respond with a concise 2-5 word title in Title Case. " +
  "No quotes, no punctuation, no preamble. Just the title."

const CHAT_SYSTEM_PROMPT =
  "You name chat conversations. Given the user's first message, respond with a concise 2-5 word title " +
  "in Title Case summarizing the topic. No quotes, no punctuation, no preamble. Just the title."

function sanitize(raw: string): string {
  let s = raw.trim()
  // strip wrapping quotes/backticks
  s = s.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim()
  // strip trailing punctuation
  s = s.replace(/[.!?;:,]+$/, "").trim()
  if (s.length > MAX_NAME_CHARS) s = s.slice(0, MAX_NAME_CHARS).trim()
  return s
}

// Single Haiku round-trip shared by the worksheet and conversation namers.
// Throws on a missing key, an API failure, or an empty title so callers can
// fall back to a truncated name and surface the error.
async function generateTitle(input: string, systemPrompt: string): Promise<string> {
  const apiKey = await getAnthropicKey()
  const snippet = input.length > MAX_INPUT_CHARS ? input.slice(0, MAX_INPUT_CHARS) : input
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: NAMING_MODEL,
    max_tokens: 32,
    system: systemPrompt,
    messages: [{ role: "user", content: snippet }],
  })
  const text = msg.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
  const name = sanitize(text)
  if (!name) throw new Error("Empty name from model")
  return name
}

export function generateWorksheetName(sql: string): Promise<string> {
  return generateTitle(sql, SQL_SYSTEM_PROMPT)
}

export function generateChatTitle(prompt: string): Promise<string> {
  return generateTitle(prompt, CHAT_SYSTEM_PROMPT)
}
