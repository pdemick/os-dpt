import Anthropic from "@anthropic-ai/sdk"

import { getAnthropicKey } from "./provider.ts"

const NAMING_MODEL = "claude-haiku-4-5-20251001"
const MAX_SQL_CHARS = 2000
const MAX_NAME_CHARS = 60

const SYSTEM_PROMPT =
  "You name SQL queries. Given a SQL snippet, respond with a concise 2-5 word title in Title Case. " +
  "No quotes, no punctuation, no preamble. Just the title."

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

export async function generateWorksheetName(sql: string): Promise<string> {
  const apiKey = await getAnthropicKey()
  const snippet = sql.length > MAX_SQL_CHARS ? sql.slice(0, MAX_SQL_CHARS) : sql
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: NAMING_MODEL,
    max_tokens: 32,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: snippet }],
  })
  const text = msg.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
  const name = sanitize(text)
  if (!name) throw new Error("Empty name from model")
  return name
}
