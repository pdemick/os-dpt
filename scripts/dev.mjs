#!/usr/bin/env node
// Run client + server with ports derived from the current working directory.
// This lets multiple sibling working copies (os-dpt, os-dpt-2, …) run
// `pnpm dev` in parallel without colliding on a fixed port.
//
// Override by setting PORT and/or VITE_PORT before running.

import { createHash } from "node:crypto"
import { spawn } from "node:child_process"

const seed = createHash("sha1").update(process.cwd()).digest()[0]
const offset = seed % 200

const apiPort = Number(process.env.PORT ?? 3756 + offset)
const vitePort = Number(process.env.VITE_PORT ?? 5173 + offset)

const env = {
  ...process.env,
  PORT: String(apiPort),
  API_PORT: String(apiPort),
  VITE_PORT: String(vitePort),
}

console.log(`os-dpt dev: workspace ${process.cwd()}`)
console.log(`os-dpt dev: api  → http://127.0.0.1:${apiPort}`)
console.log(`os-dpt dev: app  → http://localhost:${vitePort}`)
console.log()

const child = spawn(
  "pnpm",
  ["-r", "--parallel", "--filter", "./client", "--filter", "./server", "dev"],
  { stdio: "inherit", env },
)

const forward = (sig) => () => child.kill(sig)
process.on("SIGINT", forward("SIGINT"))
process.on("SIGTERM", forward("SIGTERM"))

child.on("exit", (code) => process.exit(code ?? 0))
