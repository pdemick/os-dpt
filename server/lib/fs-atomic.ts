import { promises as fs } from "node:fs"
import path from "node:path"
import { randomBytes } from "node:crypto"

export async function writeAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomBytes(4).toString("hex")}.tmp`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(tmp, content)
  await fs.rename(tmp, filePath)
}
