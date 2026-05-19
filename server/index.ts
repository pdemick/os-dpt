import { serve } from "@hono/node-server"
import { Hono } from "hono"

import { connectionsRouter } from "./api/connections.ts"
import { closeAll } from "./db/registry.ts"
import { resolveWorkspace } from "./workspace.ts"

const workspace = resolveWorkspace(process.argv.slice(2))

const app = new Hono()
app.get("/api/health", (c) => c.json({ ok: true, workspace }))
app.route("/api/connections", connectionsRouter(workspace))

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
  await closeAll()
  server.close(() => process.exit(0))
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
