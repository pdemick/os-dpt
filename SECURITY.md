# Security model

os-dpt is a **local, single-user** tool. You run it in your own working
directory; it serves a SQL editor and a chat-to-SQL agent on `localhost`. This
document describes the trust assumptions so you can decide whether they fit your
environment — several are deliberate trade-offs, not oversights.

## Threat model in one line

os-dpt trusts the user (and anything running as that OS user) on the machine it
runs on. It is **not** designed to be exposed to a network, shared between
users, or pointed at a database you are not authorized to query and modify.

## Network exposure

- The server binds to `127.0.0.1` only. It is not reachable from other hosts.
- **There is no authentication on the API.** Security relies on loopback
  isolation: any process running as the same OS user can call the API. This is
  consistent with how local database tools (e.g. DBeaver, TablePlus) work.
- Do not put os-dpt behind a reverse proxy or bind it to a public interface.

## The agent runs SQL — read-only by default

The chat agent can execute SQL against a connected database via its `run_sql`
tool. Because an LLM (and content in your own data, via prompt injection) can
steer that tool, we default to the safe posture and enforce it in layers:

1. **New connections are read-only by default.** A read-only connection opens
   its pool with `default_transaction_read_only=on`, so Postgres rejects
   writes (`INSERT`/`UPDATE`/`DELETE`/DDL) with SQLSTATE 25006.
2. **`run_sql` independently blocks non-read statements** on a read-only
   connection (single read statement only), which also closes the
   multi-statement bypass (`SET default_transaction_read_only=off; DELETE ...`)
   that the database GUC alone would not.
3. To let the agent write, **you** flip the connection to read-write in the
   Connections view. That is an explicit, per-connection decision.

**For a hard guarantee, do not rely on these guards alone.** Connect as a
database role that only has the privileges you want the agent to have (e.g. a
`SELECT`-only role, or one scoped to a sandbox schema), or point at a read
replica. The application-level guards are defense-in-depth; the database is the
only authoritative boundary.

## Credentials

- Connection passwords are encrypted with AES-256-GCM and written to
  `.os-dpt/credentials.enc`. The encryption key is stored in your OS keychain
  (macOS Keychain, Windows Credential Vault, libsecret on Linux) via `keytar`,
  keyed by a stable per-workspace UUID.
- `.os-dpt/` is gitignored. **Secrets are never written to git-tracked files.**
- There is no master-password prompt after OS login, mirroring DBeaver's
  default UX. Anyone with access to your unlocked OS user account can therefore
  use saved connections.

## TLS

- The `Use SSL` option sets `ssl: { rejectUnauthorized: false }`: traffic is
  encrypted but the **server certificate is not verified**. This is intentional
  for v1 so it does not break against self-signed dev/staging hosts. It does not
  protect against an active man-in-the-middle. A future `sslmode` option will
  allow opting into verification.

## Data sent to third parties

- The agent sends your prompts, schema, and **query results** to the configured
  LLM provider (Anthropic) to produce answers. Treat anything the agent can see
  as disclosed to that provider.
- If you enable Braintrust tracing (opt-in, off by default), traces — including
  prompts and results — are also sent to Braintrust. Leave it disabled if that
  is not acceptable for your data.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:
email **78264807+pdemick@users.noreply.github.com** with details and, if possible, a reproduction. We
will acknowledge and work on a fix before any public disclosure.
