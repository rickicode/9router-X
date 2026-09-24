# AGENTS.md — axonrouter-X

## What this is
Enterprise fork of decolua/axonrouter: AI routing gateway + dashboard.
Next.js (webpack) app with custom Express server, PostgreSQL 17 (SSOT),
Valkey/Redis L2 cache. Deployed at `http://192.168.90.101:3777`.

## Stack
- Runtime: Node.js (ES modules), Next.js 15 App Router (`--webpack`)
- DB: PostgreSQL (adapter: `src/lib/db/adapters/postgresAdapter.js`), legacy SQLite fallback (`src/lib/localDb.js`, `db.sqlite3` — usually stale, do not trust)
- Cache/locks: Valkey/Redis (model locks, cooldowns, OAuth refresh locks)
- Tests: Vitest (`tests/`), some legacy files use `node:test` (run with `node --test`, vitest reports them as "no test suite" — pre-existing, ignore)

## Layout
- `src/sse/services/auth.js` — credential resolution, account/model locking, `markAccountUnavailable`, `classifyBlockedCredentials`. HOT FILE for quota/exhaustion bugs.
- `src/sse/handlers/chat.js` — request pipeline, 503 fallback when `getProviderCredentials()` returns null
- `src/lib/consoleLogBuffer.js` — live console log capture + rotating file logger (default `${DATA_DIR}/logs/console.log`, max 5MB, 5 files). Check this file or `/dashboard/console-log` to debug provider issues and gateway errors.
- `src/lib/db/repos/connectionsRepo.js` — connection filters (`disabledAt`, `testStatus`, `isActive`)
- `open-sse/config/errorConfig.js` — error rules: cooldown per error text, `MAX_RATE_LIMIT_COOLDOWN_MS` (7d cap)
- `open-sse/utils/error.js` — `extractQuotaResetMs` ("Try again in N" parsing)
- `src/app/dashboard/` — usage/providers UI
- `custom-server.js` — entrypoint (`npm start` → port 20127; prod runs 3777)

## Graft — MANDATORY code navigation (strict rules)
A `graft/` context graph (wiring graph + per-file cards, exact `file:line`) is committed at the repo root. Code search MUST go through graft, not raw rg/grep/Read-first:
1. Orientation / "where is X": `graft ask "<plain words>"` (+ `--in <path>` to scope, `--source` to inline code).
2. Literal/regex search: `graft grep "<pattern>"` (auto-ranked by coupling, grouped by symbol).
3. Callers/callees/blast radius: `graft callers <symbol>` (default in; `--direction out`, `--depth all`), `graft blast` after edits.
4. File API surface without reading the whole file: `graft skeleton <file>`.
5. Repo-wide map & hotspots: `graft map`.
Raw `rg`/`grep`/`cat` are a last resort ONLY for files the graph doesn't index or after graft pointed you at the exact `file:line` (then Read that span, not the whole file).
Keep graft in sync after structural changes: `graft build` (fast, no key).

## Commands
- Dev: `npm run dev` · Build: `npm run build` · Start: `npm start`
- Tests: `cd tests && npx vitest run` (full), `npx vitest run unit/<file>` (targeted)
- Known pre-existing failures (env-dependent, not regressions): postgres-e2e, cached-token-e2e, db-benchmark, request-details-tab, embeddings.cloud, claude-header-forwarding, model-routing (partial), compatible-provider-connections, kimchi*, saml/cline-auth (node:test format)

## Critical rules
- Locks: `modelLocks` in Redis + DB. 429 daily-cap → lockAll on account; 402/credit exhaustion → 30d lock (by design, upstream says so). Precise `resetsAtMs` from upstream always wins over rule cooldown.
- `is_active` column must be synced when `disabledAt` is set (historical bug: jsonb `data` updated but column stale → "No active credentials" 503 despite UI showing active).
- Error messages: use classified codes (`ACCOUNT_EXHAUSTED`, `MIXED_BLOCKED`, …) with `status_breakdown` + `retry_after` — never the generic "No active credentials" for exhausted/disabled accounts.
- opencode-zen: billing/entitlement errors are model-scoped (`opencodeZenModelOnlyError`), only explicit invalid-key disables an account.
- Deploy: push to `origin/master` (github.com/rickicode/axonrouter-X); prod box (192.168.90.101) pulls from GitHub. No SSH access from this workspace. Multiple agents push concurrently — always `git pull --rebase` before push.
- Never commit `.env` (holds DB/gateway secrets). `.env` for this workspace lives outside the repo.
