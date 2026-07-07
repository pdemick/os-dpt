# os-dpt

A local, web-based SQL editor with a built-in chat-to-SQL agent — where the
agent's knowledge lives as **plain markdown files in your repo** that you can
read, diff, and revert.

You run it in your own working directory and use it from `localhost`. Your
queries and the agent's evolving understanding of your data are ordinary files,
version-controlled by git. Nothing about your data leaves your machine except
what you send to your LLM provider when you ask the agent a question.

## Why

Good data agents are mostly about **context** — schema, business meaning, past
queries, and hard-won corrections. Most tools keep that context in a vendor's
database where you can't see it. os-dpt keeps every layer as a file you own:

- **Live schema** — introspected from the database on demand.
- **Curated docs** — `context/schemas.md`, `context/conventions.md`,
  `context/feedback.md`: human- and agent-editable markdown, scoped per data
  source.
- **Memory** — when the agent learns something durable (a clarified column, a
  data-quality quirk, a correction), it writes it back to those files. Because
  they're git-tracked, you see a diff for every change the agent makes to its
  own understanding, and you can revert it.

The result is an agent whose "learning" is transparent and yours, not a black
box.

## Quick start

```bash
# In the directory you want as your workspace:
npx os-dpt
```

This launches a local server on `127.0.0.1` and opens the editor in your
browser. On first run it creates a workspace (see below). Add a database
connection (Postgres to start), then open a worksheet or the chat panel.

You'll need an Anthropic API key for the agent — set it in **Settings → AI
providers**.

To install it globally instead:

```bash
npm install -g os-dpt
os-dpt
```

### Options

```
os-dpt [options]

  --workspace <dir>   Workspace directory (default: current directory)
  --port <n>          Preferred port (default: 3756, falls back if taken)
  --no-open           Don't open the browser automatically
  -v, --version       Print version
  -h, --help          Show this help
```

## Workspace layout

os-dpt treats your current directory as the workspace root (like `git` or
`npm`):

```
<workspace>/
├── .os-dpt/          # gitignored — encrypted credentials, cache, drafts
├── worksheets/       # git-tracked .sql files, one per worksheet
├── context/          # git-tracked agent memory (markdown), scoped per source
├── connections.json  # connection metadata (no secrets)
└── .gitignore        # excludes .os-dpt/
```

Anything sensitive lives in `.os-dpt/` and is gitignored. Anything worth
versioning — your queries and the agent's context — is plain text at the root.

If the directory isn't already a git repository, os-dpt runs `git init` so
worksheet/context history works out of the box.

## How the agent works

A small, focused tool loop (see `server/agent/`):

- `get_schema` — introspect live tables/columns.
- `get_context` / `update_context` — read and write the markdown knowledge files.
- `run_sql` — execute SQL (read-only by default; see Security).
- `write_sql` — stage SQL into a worksheet for you to review and save.
- `render_chart` — draw a chart inline from query results.
- `ask_user_question` — pause and ask rather than guess.

## Security

os-dpt is a **single-user, loopback-only** tool with no API authentication, and
the agent can run SQL against your database. **Connections are read-only by
default**; you opt into writes per connection. For the full trust model —
credential storage, the read-only guards, TLS behavior, and what gets sent to
your LLM provider — read [SECURITY.md](./SECURITY.md) before pointing it at
anything important.

## Develop

Requires Node and pnpm. This is a pnpm monorepo (`client` + `server`).

```bash
pnpm install
pnpm dev          # Vite + Hono in parallel
pnpm typecheck    # gate changes with this
```

Run the app against a throwaway workspace so you never materialize personal
data in the repo:

```bash
os-dpt --workspace ./dev-workspace
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for design principles and how to add a
database driver.

## License

[MIT](./LICENSE) © Paul Demick
