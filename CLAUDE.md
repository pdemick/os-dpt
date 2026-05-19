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
├── context/                  # git-tracked agent memory (markdown)
│   ├── schemas.md
│   ├── conventions.md
│   └── feedback.md
├── connections.json          # connection metadata (host, port, db, user) — no secrets
└── .gitignore                # ensures .os-dpt/ is excluded
```

Rule of thumb: anything sensitive lives in `.os-dpt/` and is gitignored. Anything the user benefits from versioning (queries + agent context) is plain files at workspace root.

## Key design decisions

### Credential storage
- OS keychain via **keytar** (macOS Keychain, Windows Credential Vault, libsecret on Linux).
- Approach: a per-workspace master key is stored in the OS keychain; per-connection credentials are AES-GCM-encrypted with that key and written to `.os-dpt/credentials.enc`.
- No master password prompt after OS login — mirrors DBeaver's default UX.

### Agent memory
- The agent's "learning" is just markdown files in `context/`. The `write_context` tool appends or edits these; `get_context` reads them into the prompt.
- Because they're git-tracked, the user sees a full diff every time the agent updates its understanding, and can revert.

### SQL worksheets as files
- Each editor "tab" is a `.sql` file in `worksheets/`. Saving a worksheet = writing the file. Git provides history; no separate versioning system.
- A worksheet is an iterative workspace, not a single canonical query — the AI agent rewrites the file in place as the user collaborates with it.
- The history viewer in the UI is a thin wrapper over `git log` / `git diff` for the specific file.

### Database drivers
- Start with `pg` for Postgres. Driver interface in `src/server/db/` is designed so adding MySQL, SQLite, etc. is a new module, not a refactor.

## Open questions / not yet decided

- Exact backend HTTP framework (likely Hono or Fastify — small, fast, good WS story).
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

- Repo initialized on `main` with `.gitignore` covering workspace paths + a `dev-workspace/` dir.
- Top-level `client/`, `server/`, `shared/`, `cli/`, `bin/` directories exist. Only `client/` has real code so far.
- Client scaffolded via `pnpm dlx shadcn@latest init --template vite --preset b1VlIttI --name client`. Sidebar component added via `shadcn add sidebar`.
- App shell built: `SidebarProvider` + `AppSidebar` with three nav items (Worksheets / Connections / Settings) and a state-based view switcher in `client/src/App.tsx`. All three views are blank placeholders in `client/src/views/`.
- Verified end-to-end in browser at `localhost:5173` — view switching + sidebar collapse work, no console errors.

Next: stub the Node server (framework TBD: Hono vs Fastify), then a CLI in `cli/` that boots the server and opens the browser. Root `package.json` to coordinate the workspace (pnpm monorepo) once there's a second package.
