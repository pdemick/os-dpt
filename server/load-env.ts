// Dev convenience: load a local .env (e.g. BRAINTRUST_API_KEY) into
// process.env. Checks the cwd and the repo root, since `pnpm dev` runs from
// server/ while a dev may keep their .env at the monorepo root. Best-effort —
// process.loadEnvFile throws if the file is absent, which we ignore.
//
// Imported for its side effect, before anything else in index.ts, so the env
// is populated before any module top-level reads process.env.
for (const envPath of [".env", "../.env"]) {
  try {
    process.loadEnvFile(envPath)
  } catch {
    // no .env at this path — fine
  }
}
