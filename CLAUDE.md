# os-dpt

A local, web-based SQL editor with a built-in chat-to-SQL AI agent. Distributed via npm; users run it in their own working directory and interact via `localhost`.

## Product shape

- `npx os-dpt` (or globally installed) launches a local server and opens a browser to a modern SQL editor.
- Users connect to one or more databases (Postgres first; driver layer pluggable for MySQL / SQLite / etc. later).
- A side-panel chat agent can write SQL into the editor. The agent has tools — at minimum `get_context` and `write_context` — and learns from user feedback by updating markdown files on disk.
- SQL pages and agent context are plain files in the user's workspace, version-controlled by git so users see full history of both queries and the agent's evolving knowledge.
- Credentials are stored locally, encrypted, never committed.

## Repo layout (the npm package)

```
os-dpt/
├── bin/                      # CLI entrypoint — `npx os-dpt` lands here
├── cli/                      # arg parsing, server bootstrap, browser open
├── server/                   # local backend (Node)
│   ├── api/                  # HTTP + WS routes consumed by the client
│   ├── db/                   # connection drivers (postgres first, pluggable)
│   ├── agent/                # LLM client, tool definitions, prompt assembly
│   ├── storage/              # read/write worksheets + markdown, git operations
│   └── credentials/          # encrypted vault (OS keychain via keytar)
├── client/                   # React app (Vite + shadcn, scaffolded from preset b1VlIttI)
│   ├── src/
│   │   ├── components/       # shadcn UI primitives (ui/) + app-level components
│   │   ├── views/            # top-level screens: Worksheets, Connections, Settings
│   │   ├── hooks/, lib/      # shared client utilities
│   │   ├── App.tsx           # sidebar shell + view switcher
│   │   └── main.tsx          # Providers (Theme, Tooltip) + root render
│   ├── package.json          # client has its own deps (React 19, Vite 7, Tailwind 4)
│   └── vite.config.ts
├── shared/                   # types shared between server + client
├── CLAUDE.md
└── .gitignore
```

`client/` is its own package with its own `package.json` (React 19, Vite 7, Tailwind 4, shadcn). The plan is for the root server to build the client (`vite build`) and serve the static `dist/` plus the API on one port. Likely move to a pnpm monorepo once the root server/cli has a `package.json` of its own.

## User workspace layout

Created on first run in the user's **current directory**. `os-dpt` treats the cwd as the workspace root, similar to how `git` and `npm` behave.

```
<workspace>/
├── .os-dpt/                  # gitignored — secrets, cache, lockfiles
│   └── credentials.enc       # AES-GCM blob; key lives in OS keychain
├── worksheets/               # git-tracked SQL worksheets, one file per worksheet
│   └── <slug>.sql
├── dashboards/               # git-tracked dashboards, one JSON file per dashboard
│   └── <slug>.json           # chart definitions (sql + connectionId + chart config) — never result data
├── context/                  # git-tracked agent memory (markdown), scoped per data source
│   ├── schemas.md            # "unassigned" set — used when no connection is bound
│   ├── conventions.md
│   ├── feedback.md
│   └── by-source/<conn-id>/  # per-connection docs (schemas/conventions/feedback.md)
├── connections.json          # connection metadata (host, port, db, user) — no secrets
└── .gitignore                # ensures .os-dpt/ is excluded
```

Rule of thumb: anything sensitive lives in `.os-dpt/` and is gitignored. Anything the user benefits from versioning (queries + agent context) is plain files at workspace root.

## Key design decisions

### Credential storage
- OS keychain via **keytar** (macOS Keychain, Windows Credential Vault, libsecret on Linux).
- Approach: a per-workspace master key is stored in the OS keychain; per-connection credentials are AES-256-GCM-encrypted with that key and written to `.os-dpt/credentials.enc`.
- The keychain entry is keyed by a stable workspace UUID stored in `.os-dpt/workspace-id`, not the workspace path — so the key survives the workspace being moved, accessed via a symlink, or hit by case-sensitivity quirks.
- No master password prompt after OS login — mirrors DBeaver's default UX.

### Security posture
- Server binds to `127.0.0.1` only. No authentication on the API; security relies on loopback isolation (any process running as the same user can hit the API, which is consistent with how DBeaver-class tools work locally).
- The `Use SSL` checkbox on a connection sets `ssl: { rejectUnauthorized: false }` — traffic is encrypted, but the server certificate is **not** verified. This is intentional for v1 to avoid breaking against self-signed dev/staging hosts; a future `sslmode` field can opt into verification.

### Agent memory
- The agent's "learning" is just markdown files in `context/`. The `update_context` tool appends or edits these; `get_context` reads them into the prompt.
- Context is **scoped per data source**: docs live in `context/by-source/<connection-id>/` and `get_context`/`update_context` target the connection bound to the chat. With no connection bound they fall back to the workspace-root "unassigned" set (`context/*.md`).
- The **Documentation** view (left sidebar) exposes these docs for humans to read/edit, with a data-source filter that switches between the unassigned set and each connection. Backed by `/api/context` (`connectionId` query param).
- Because they're git-tracked, the user sees a full diff every time the agent updates its understanding, and can revert.

### Agent tracing (Braintrust)
- The agent loop is instrumented with **Braintrust** for tracing/observability — primarily a dev tool for inspecting turns and refining prompts. It's **opt-in**: a complete no-op until a key is set. The key is managed like the LLM keys — **Settings → AI providers → Observability** (provider id `braintrust`, kind `observability`), stored in the encrypted vault. `BRAINTRUST_API_KEY` env still works as an override (CI/one-offs) and wins over the vault; `BRAINTRUST_PROJECT` defaults to `os-dpt`. Setting/clearing the key in the UI calls `refreshTracing()` so it takes effect without a restart. `pnpm dev` also auto-loads a root or `server/` `.env`.
- The SDK (`braintrust`) is an **optional peer dependency** loaded via a guarded **dynamic import** in `server/agent/tracing.ts`: it isn't installed in a normal `npx os-dpt` install (it carries a heavy tree — `express`, `simple-git`, `esbuild`, etc.), so users who never enable tracing don't ship it. It's a `devDependency` here so the repo's own dev/build/typecheck have it. A missing package degrades gracefully (init logs a `pnpm add braintrust` hint) rather than crashing the server, and tracing-off installs pay no import cost.
- Span shape: each chat is **one trace** — a `conversation` root span (created on the first turn; its exported handle is persisted as `meta.traceParent` and reused so later turns resume the same trace rather than starting new ones). Under it, each turn is a `task` span (`runAgentTurn`), with child `llm` spans per Anthropic call (`provider.ts` — full prompt in, response + token metrics out, logged explicitly since `wrapAnthropic` doesn't instrument the `messages.stream()` helper we use) and `tool` spans per tool execution (`loop.ts`). `tracing.traced()` is a transparent passthrough when disabled, so call sites wrap unconditionally.
- Prompt caching is **always on and independent of tracing** (it's a plain cost/latency win, not a tracing feature — it runs whether or not a Braintrust key is set): `provider.ts` marks the system+tools prefix and the conversation tail with `cache_control: ephemeral`, so the static prefix and growing history are cached across steps/turns (traces show `prompt_cache_creation_tokens` on the first call, `prompt_cached_tokens` on later ones). This relies on `buildSystemPrompt` (`prompt.ts`) being stable per chat — see the guard comment there before adding anything dynamic to the system prompt.

### SQL worksheets as files
- Each editor "tab" is a `.sql` file in `worksheets/`. Saving a worksheet = writing the file. Git provides history; no separate versioning system.
- A worksheet is an iterative workspace, not a single canonical query — the AI agent rewrites the file in place as the user collaborates with it.
- The history viewer in the UI is a thin wrapper over `git log` / `git diff` for the specific file.

### Database drivers
- Start with `pg` for Postgres. Driver interface in `src/server/db/` is designed so adding MySQL, SQLite, etc. is a new module, not a refactor.

### Backend HTTP framework
- **Hono** on top of `@hono/node-server`. Small, fast, ergonomic routing, and a future-proof story for WebSockets / streaming.

## Open questions / not yet decided

- LLM provider abstraction — single provider to start vs. provider-agnostic from day one.
- Whether the agent runs entirely in the local server process or whether we expose a more structured "agent loop" the user could swap.
- How to handle workspaces where the user hasn't run `git init` — auto-init? warn? require?

## Open-source hygiene

The npm package (this repo) and a user's workspace are fully separate concerns:

- This repo contains source code only. It never ships any user's worksheets, connections, or context.
- A user's personal data lives in whatever directory they run `os-dpt` in.

**Foot-gun to watch**: running `os-dpt` inside this repo during development would materialize `worksheets/`, `connections.json`, `context/`, and `.os-dpt/` at the repo root. To prevent any accidental commit of personal data:

1. Those workspace paths are explicitly listed in `.gitignore`.
2. Development testing uses a dedicated `dev-workspace/` directory (also gitignored). Invoke os-dpt against it via `os-dpt --workspace ./dev-workspace` (or an equivalent `pnpm dev` script once package.json exists).

## Status

- pnpm monorepo: `client` + `server` workspaces, root scripts orchestrate both (`pnpm dev` runs Vite + Hono in parallel).
- **Connections module live**: Hono server on `127.0.0.1:3756`, `/api/connections` (list/create/delete/test/connect/disconnect), AES-256-GCM credential vault in `.os-dpt/credentials.enc`, in-process `pg` pool registry, SIGINT/SIGTERM-driven graceful shutdown. Connections UI rebuilt with Active/Saved sections + Add dialog (Postgres-only).
- **Worksheets module live**: CodeMirror 6 (Postgres dialect) editor with schema-aware autocomplete from `.os-dpt/schema.json`. Each tab is a `.sql` file in `worksheets/`; `Cmd+S` writes the git-tracked file, debounced autosave keeps a draft in `.os-dpt/drafts/<slug>.sql`. Open tabs / active tab / cursor restored from `.os-dpt/session.json`. Routes: `/api/worksheets`, `/api/drafts`, `/api/session`, `/api/schema`.
- **Dashboards module live**: charts rendered by the chat agent can be saved to git-tracked `dashboards/<slug>.json` files (chart config + source SQL + connection id — result data is never persisted; it's re-fetched via the connection query route on open/refresh). Dashboards view: chart grid (the dashboard list lives in the app sidebar's collapsible submenu), per-dashboard Refresh, per-chart hover actions (refresh / remove), and an Edit button in each chart's expanded source-query footer (placeholder states get a hover pencil instead). The source-query editor dialog reuses CodeMirror + ResultTable and embeds a chat-to-SQL prompt driven by a slug-less `quick-edit` agent session — `write_sql` with no worksheet bound skips the draft write and streams the SQL back via a `sql_written` event with `worksheetSlug: null`.
- Shared types live in `shared/`, consumed by both packages via `@shared/*`.
- Client app shell: `SidebarProvider` + `AppSidebar`; the Chat, Worksheets, and Dashboards nav items are collapsible submenus (shared `CollapsibleNavItem`, 7-row scroll cap, pinned new-item action) listing their sessions/files, backed by shell-level providers in `App.tsx` (`WorksheetsProvider`, `DashboardsProvider`, standalone `AgentChatProvider`) so state survives view switches.

Next: CLI in `cli/` that boots the server and opens the browser; root `package.json` already coordinates the monorepo. `/api/query` + results grid and the chat agent are the next features.
