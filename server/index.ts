// Must be first: loads a local .env into process.env before any other module
// body runs and reads it (ESM evaluates imports in order).
import "./load-env.ts"

import { pathToFileURL } from "node:url"
import type { Server } from "node:http"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import { aiProvidersRouter } from "./api/ai-providers.ts"
import { autoConnectAll, connectionsRouter } from "./api/connections.ts"
import { closeAll } from "./db/registry.ts"
import { initWorkspace } from "./workspace.ts"
import worksheets from "./api/worksheets.ts"
import drafts from "./api/drafts.ts"
import session from "./api/session.ts"
import schema from "./api/schema.ts"
import history from "./api/history.ts"
import agent from "./api/agent.ts"
import context from "./api/context.ts"
import { closeHistoryDb, openHistoryDb } from "./history/db.ts"
import { startWorksheetsWatcher, stopWorksheetsWatcher } from "./history/watcher.ts"
import { flushTracing, initTracing } from "./agent/tracing.ts"
import { serveClient } from "./static.ts"

export { openBrowser } from "./lib/open-browser.ts"

export interface BootInfo {
  url: string
  port: number
  workspace: string
  close: () => Promise<void>
}

const DEFAULT_PORT = 3756

// Bind `app` to `port`; on EADDRINUSE retry once with an ephemeral port (0).
// Resolves with the actually-bound Node http server.
function listen(app: Hono, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    let retried = false
    const attempt = (p: number) => {
      const server = serve({ fetch: app.fetch, port: p, hostname: "127.0.0.1" }) as Server
      server.once("listening", () => resolve(server))
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && !retried) {
          retried = true
          attempt(0)
        } else {
          reject(err)
        }
      })
    }
    attempt(port)
  })
}

export async function startServer(argv: string[] = process.argv.slice(2)): Promise<BootInfo> {
  const workspace = await initWorkspace(argv)
  await initTracing()
  openHistoryDb()
  startWorksheetsWatcher()
  void autoConnectAll(workspace)

  const app = new Hono()
  app.get("/api/health", (c) => c.json({ ok: true, workspace }))
  app.route("/api/connections", connectionsRouter(workspace))
  app.route("/api/ai-providers", aiProvidersRouter(workspace))
  app.route("/api/worksheets", worksheets)
  app.route("/api/drafts", drafts)
  app.route("/api/session", session)
  app.route("/api/schema", schema)
  app.route("/api/history", history)
  app.route("/api/agent", agent)
  app.route("/api/context", context)

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    console.error("[os-dpt]", err)
    return c.json({ error: err.message }, 500)
  })

  // Serve the built client on the same port (packaged/prod). No-op in dev,
  // where Vite serves the client and proxies /api here. Mounted last so the
  // catch-all never shadows an /api route.
  serveClient(app)

  const preferredPort = Number(process.env.PORT ?? DEFAULT_PORT)
  const server = await listen(app, preferredPort)
  const addr = server.address()
  const port = typeof addr === "object" && addr ? addr.port : preferredPort
  const url = `http://127.0.0.1:${port}`

  let shuttingDown = false
  const close = async () => {
    if (shuttingDown) return
    shuttingDown = true
    stopWorksheetsWatcher()
    closeHistoryDb()
    await flushTracing()
    await closeAll()
    await new Promise<void>((res) => server.close(() => res()))
  }

  return { url, port, workspace, close }
}

// Auto-start when run directly (e.g. `tsx index.ts` in dev). When imported by
// the CLI entrypoint, the bin owns startup and this guard stays false.
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const boot = await startServer()
  console.log(`os-dpt server listening on ${boot.url}`)
  console.log(`workspace: ${boot.workspace}`)

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`\nreceived ${signal}, closing pools…`)
    await boot.close()
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
