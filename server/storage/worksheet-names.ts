import { promises as fs } from "node:fs"
import path from "node:path"

import { writeAtomic } from "../lib/fs-atomic.ts"
import { workspaceRoot } from "../workspace.ts"

const FILE = path.join(".os-dpt", "worksheet-names.json")

function filePath(): string {
  return path.join(workspaceRoot(), FILE)
}

export async function readNames(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(filePath(), "utf8")
    const data = JSON.parse(raw) as { names?: Record<string, string> }
    return data.names ?? {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw err
  }
}

export async function getName(slug: string): Promise<string | null> {
  const all = await readNames()
  return all[slug] ?? null
}

async function writeNames(all: Record<string, string>): Promise<void> {
  await writeAtomic(filePath(), JSON.stringify({ names: all }, null, 2) + "\n")
}

// Serialize read-modify-write cycles so concurrent set/delete calls don't
// clobber each other. Each mutation re-reads inside the critical section.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

export function setName(slug: string, name: string): Promise<void> {
  return enqueue(async () => {
    const all = await readNames()
    if (all[slug] === name) return
    all[slug] = name
    await writeNames(all)
  })
}

export function deleteName(slug: string): Promise<void> {
  return enqueue(async () => {
    const all = await readNames()
    if (!(slug in all)) return
    delete all[slug]
    await writeNames(all)
  })
}
