import crypto from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

const FILE = path.join(".os-dpt", "workspace-id")

export async function getOrCreateWorkspaceId(workspace: string): Promise<string> {
  const filePath = path.join(workspace, FILE)
  try {
    const raw = await fs.readFile(filePath, "utf8")
    const id = raw.trim()
    if (id) return id
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
  const id = crypto.randomUUID()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, id + "\n", { encoding: "utf8", mode: 0o600 })
  return id
}
