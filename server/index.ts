import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

import { aiProvidersRouter } from "./api/ai-providers.ts"
import { connectionsRouter } from "./api/connections.ts"
import { closeAll } from "./db/registry.ts"
import { initWorkspace } from "./workspace.ts"
import worksheets from "./api/worksheets.ts"
import drafts from "./api/drafts.ts"
import session from "./api/session.ts"
import schema from "./api/schema.ts"
import history from "./api/history.ts"
import agent from "./api/agent.ts"
import { closeHistoryDb, openHistoryDb } from "./history/db.ts"
import { startWorksheetsWatcher, stopWorksheetsWatcher } from "./history/watcher.ts"

const workspace = await initWorkspace(process.argv.slice(2))
openHistoryDb()
startWorksheetsWatcher()

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

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error("[os-dpt]", err)
  return c.json({ error: err.message }, 500)
})

const port = Number(process.env.PORT ?? 3756)
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`os-dpt server listening on http://127.0.0.1:${info.port}`)
  console.log(`workspace: ${workspace}`)
})

let shuttingDown = false
const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\nreceived ${signal}, closing pools…`)
  stopWorksheetsWatcher()
  closeHistoryDb()
  await closeAll()
  server.close(() => process.exit(0))
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
