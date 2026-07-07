#!/usr/bin/env node
// Bundle the TypeScript server into a single ESM file for the published npm
// package. Native modules and a few heavy/CJS-interop deps stay EXTERNAL — they
// are resolved from node_modules at the user's install time (declared as the
// package's runtime `dependencies`) rather than inlined here. keytar and
// better-sqlite3 in particular ship .node binaries that cannot be bundled.

import { build } from "esbuild"
import { existsSync } from "node:fs"
import { cp, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const external = [
  "@anthropic-ai/sdk",
  "hono",
  "@hono/node-server",
  "pg",
  "keytar",
  "better-sqlite3",
  "braintrust", // optional peer — never installed in a normal `npx os-dpt`
]

await build({
  entryPoints: [path.join(root, "server/index.ts")],
  outfile: path.join(root, "server/dist/index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external,
  // Resolve the @shared/* path alias used across the server.
  alias: { "@shared": path.join(root, "shared") },
  logLevel: "info",
})

console.log("os-dpt: server bundled -> server/dist/index.mjs")

// Copy the built client next to the bundle so it ships under server/dist/ and
// is served on the same port at runtime (see server/static.ts). Run
// `build:client` first (the root `build` script does).
const clientSrc = path.join(root, "client/dist")
const clientDest = path.join(root, "server/dist/client")
if (existsSync(clientSrc)) {
  await rm(clientDest, { recursive: true, force: true })
  await cp(clientSrc, clientDest, { recursive: true })
  console.log("os-dpt: client copied  -> server/dist/client")
} else {
  console.warn("os-dpt: client/dist not found — run `pnpm run build:client` first")
}
