import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"

import type { Hono } from "hono"

// The built client is copied next to the bundled server at build time:
//   <pkg>/server/dist/index.mjs  ->  <pkg>/server/dist/client
// (Kept under server/dist rather than client/dist so it ships in one clean
// tree — client/.gitignore's `dist` rule otherwise excludes it from the npm
// tarball.) In dev (tsx running server/index.ts) this path doesn't exist, so
// static serving stays dormant and the Vite proxy is used instead.
function defaultClientDir(): string {
  if (process.env.OSDPT_CLIENT_DIST) return path.resolve(process.env.OSDPT_CLIENT_DIST)
  return fileURLToPath(new URL("./client", import.meta.url))
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
}

function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream"
}

// Hashed Vite assets are immutable; everything else (incl. index.html) must
// revalidate so an upgraded package serves fresh HTML.
function cacheControl(urlPath: string): string {
  return urlPath.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "no-cache"
}

// Returns true if static serving was mounted (i.e. a built client was found).
// Call AFTER all /api routes are registered — the catch-all owns everything
// else and falls back to index.html for client-side routing.
export function serveClient(app: Hono, clientDir = defaultClientDir()): boolean {
  if (!existsSync(path.join(clientDir, "index.html"))) return false

  const indexHtml = path.join(clientDir, "index.html")

  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api")) return c.notFound()

    // Resolve the request to a file inside clientDir, guarding traversal.
    const rel = decodeURIComponent(c.req.path).replace(/^\/+/, "")
    const candidate = path.resolve(clientDir, rel)
    const isInside = candidate === clientDir || candidate.startsWith(clientDir + path.sep)

    let file = indexHtml
    if (isInside && rel !== "" && existsSync(candidate) && !candidate.endsWith(path.sep)) {
      file = candidate
    }

    try {
      const body = await readFile(file)
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": contentType(file),
          "cache-control": cacheControl(c.req.path),
        },
      })
    } catch {
      // Missing asset with an extension -> 404; otherwise SPA fallback already
      // selected index.html above.
      return c.notFound()
    }
  })

  return true
}
