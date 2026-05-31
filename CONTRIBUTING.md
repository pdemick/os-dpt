# Contributing to os-dpt

Thanks for your interest. os-dpt is a small, local-first tool, and we want the
codebase to stay legible enough that a newcomer can read the agent loop in one
sitting. A few principles keep it that way.

## Getting set up

```bash
pnpm install
pnpm dev          # runs the Vite client and the Hono server in parallel
pnpm typecheck    # run this before every PR — it's the gate
```

Always test against a throwaway workspace so you never commit personal data:

```bash
os-dpt --workspace ./dev-workspace   # dev-workspace/ is gitignored
```

`pnpm typecheck` is the contract for changes. (`build` is not currently a
reliable gate — use `typecheck`.)

## Design principles

These mirror what tends to make data agents work in practice — fewer, sharper
tools and less rigid prompting beat piling on capabilities:

- **Few, focused tools.** Adding a tool is a real cost: overlapping or
  near-duplicate tools confuse the model more than they help. Before adding
  one, check whether an existing tool should be extended instead.
- **Prefer high-level guidance over rigid scripts in prompts.** Prescriptive,
  step-by-step instructions tend to backfire; trust the model and give it the
  context to reason. Keep the system prompt stable per chat — it's a
  prompt-cache prefix (see the guard comment in `server/agent/prompt.ts`).
- **Context is files the user owns.** The agent's knowledge lives in git-tracked
  markdown under `context/`. Keep it that way — don't introduce a hidden store
  the user can't see or diff.
- **Secure by default.** New connections are read-only; the agent can't write
  unless the user opts in. Don't weaken that default. See `SECURITY.md`.

## Adding a database driver

The driver layer (`server/db/`) is designed so a new database is a new module,
not a refactor. Postgres is the reference implementation (`postgres.ts`). A new
driver should provide connection/pool creation, schema introspection, and error
normalization behind the same shape the registry and tools already consume.
Open an issue first to discuss the interface if anything doesn't fit.

## Pull requests

- Keep PRs focused; one concern per PR.
- Run `pnpm typecheck` and make sure the client and server both pass.
- Match the surrounding code's style, comment density, and naming.
- For agent-behavior changes, describe how you verified the change (the project
  uses Braintrust tracing to inspect agent turns).

## Reporting bugs and vulnerabilities

- Functional bugs: open a GitHub issue.
- Security issues: **do not** open a public issue — see
  [SECURITY.md](./SECURITY.md).
