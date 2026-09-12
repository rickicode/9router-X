# AGENTS.md — 9router-X

## What this is
Enterprise fork of decolua/9router: AI routing gateway + dashboard.
Next.js (webpack) app with custom Express server, PostgreSQL 17 (SSOT),
Valkey/Redis L2 cache. Deployed at `http://192.168.90.101:10128`.

## Stack
- Runtime: Node.js (ES modules), Next.js 15 App Router (`--webpack`)
- DB: PostgreSQL (adapter: `src/lib/db/adapters/postgresAdapter.js`), legacy SQLite fallback (`src/lib/localDb.js`, `db.sqlite3` — usually stale, do not trust)
- Cache/locks: Valkey/Redis (model locks, cooldowns, OAuth refresh locks)
- Tests: Vitest (`tests/`), some legacy files use `node:test` (run with `node --test`, vitest reports them as "no test suite" — pre-existing, ignore)

## Layout
- `src/sse/services/auth.js` — credential resolution, account/model locking, `markAccountUnavailable`, `classifyBlockedCredentials`. HOT FILE for quota/exhaustion bugs.
- `src/sse/handlers/chat.js` — request pipeline, 503 fallback when `getProviderCredentials()` returns null
- `src/lib/db/repos/connectionsRepo.js` — connection filters (`disabledAt`, `testStatus`, `isActive`)
- `open-sse/config/errorConfig.js` — error rules: cooldown per error text, `MAX_RATE_LIMIT_COOLDOWN_MS` (7d cap)
- `open-sse/utils/error.js` — `extractQuotaResetMs` ("Try again in N" parsing)
- `src/app/dashboard/` — usage/providers UI
- `custom-server.js` — entrypoint (`npm start` → port 20127; prod runs 10128)

## Commands
- Dev: `npm run dev` · Build: `npm run build` · Start: `npm start`
- Tests: `cd tests && npx vitest run` (full), `npx vitest run unit/<file>` (targeted)
- Known pre-existing failures (env-dependent, not regressions): postgres-e2e, cached-token-e2e, db-benchmark, request-details-tab, embeddings.cloud, claude-header-forwarding, model-routing (partial), compatible-provider-connections, kimchi*, saml/cline-auth (node:test format)

## Critical rules
- Locks: `modelLocks` in Redis + DB. 429 daily-cap → lockAll on account; 402/credit exhaustion → 30d lock (by design, upstream says so). Precise `resetsAtMs` from upstream always wins over rule cooldown.
- `is_active` column must be synced when `disabledAt` is set (historical bug: jsonb `data` updated but column stale → "No active credentials" 503 despite UI showing active).
- Error messages: use classified codes (`ACCOUNT_EXHAUSTED`, `MIXED_BLOCKED`, …) with `status_breakdown` + `retry_after` — never the generic "No active credentials" for exhausted/disabled accounts.
- opencode-zen: billing/entitlement errors are model-scoped (`opencodeZenModelOnlyError`), only explicit invalid-key disables an account.
- Deploy: push to `origin/master` (github.com/rickicode/9router-X); prod box (192.168.90.101) pulls from GitHub. No SSH access from this workspace. Multiple agents push concurrently — always `git pull --rebase` before push.
- Never commit `.env` (holds DB/gateway secrets). `.env` for this workspace lives outside the repo.
