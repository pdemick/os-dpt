import path from "node:path"

export function resolveWorkspace(argv: string[]): string {
  const idx = argv.indexOf("--workspace")
  const raw = idx >= 0 ? argv[idx + 1] : undefined
  return path.resolve(raw ?? process.cwd())
}
