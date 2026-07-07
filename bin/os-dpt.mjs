#!/usr/bin/env node
// `npx os-dpt` entrypoint. Boots the bundled server (which serves the built
// client on the same port), then opens the browser. The current working
// directory is treated as the workspace — like git/npm.

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8"))

const argv = process.argv.slice(2)
const has = (...flags) => flags.some((f) => argv.includes(f))

if (has("--help", "-h")) {
  console.log(`os-dpt ${pkg.version} — local SQL editor with a chat-to-SQL agent

Usage:
  os-dpt [options]

Options:
  --workspace <dir>   Workspace directory (default: current directory)
  --port <n>          Preferred port (default: 3756, falls back if taken)
  --no-open           Don't open the browser automatically
  -v, --version       Print version
  -h, --help          Show this help

The current directory becomes your workspace: worksheets/ and context/ are
git-tracked; secrets live in .os-dpt/ (gitignored).`)
  process.exit(0)
}

if (has("--version", "-v")) {
  console.log(pkg.version)
  process.exit(0)
}

// startServer(argv) does the real arg parsing (--workspace, --no-open, --port).
// We pre-read --port here only to set process.env.PORT *before* importing the
// server bundle, since some config reads the env at module load.
const portIdx = argv.findIndex((a) => a === "--port")
if (portIdx !== -1 && argv[portIdx + 1]) {
  process.env.PORT = argv[portIdx + 1]
}

const { startServer, openBrowser } = await import("../server/dist/index.mjs")

const boot = await startServer(argv)

console.log(`\n  os-dpt is running`)
console.log(`  ➜  ${boot.url}`)
console.log(`  ➜  workspace: ${boot.workspace}`)
console.log(`\n  Press Ctrl-C to stop.\n`)

if (!has("--no-open")) {
  const opened = await openBrowser(boot.url)
  if (!opened) console.log(`  Open ${boot.url} in your browser.`)
}

const shutdown = async () => {
  await boot.close()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
