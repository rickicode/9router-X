<div align="center">
  <img src="./images/9router.png?1" alt="9Router-X Dashboard" width="800"/>
  
  # 9Router-X — Enterprise-Grade AI Routing Gateway & Token Optimizer
  
  **Never stop coding. Save 20-40% tokens with RTK + Headroom context compression + auto-fallback to FREE & cheap AI models.**
  
  **Connect all AI coding tools (Claude Code, Cursor, Codex, OpenClaw, Antigravity, Copilot, Cline...) to 40+ providers with PostgreSQL 17 concurrency, Valkey/Redis L2 caching, and zero file-lock bottlenecks.**

  [![GitHub Stars](https://img.shields.io/github/stars/rickicode/9router-X.svg?style=flat)](https://github.com/rickicode/9router-X)
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
  [![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_17-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
  [![Valkey](https://img.shields.io/badge/Cache-Valkey_8_%2F_Redis_7+-CC0000?logo=redis&logoColor=white)](https://valkey.io/)
  [![Docker](https://img.shields.io/badge/Deployment-Docker_Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

[⚡ 9Router-X vs Original](#-9router-x-vs-9router-original) • [🚀 Quick Start (Docker)](#-quick-start-docker-compose---recommended) • [💡 Features](#-key-features) • [🛠️ Supported Tools](#%EF%B8%8F-supported-cli-tools) • [🌐 Providers](#-supported-providers) • [📖 Setup](#-setup-guide)

</div>

---

## ⚡ 9Router-X vs 9Router Original

9Router-X is an enterprise-grade, high-concurrency fork of [decolua/9router](https://github.com/decolua/9router). While the original project targets single-user desktop tray setups with embedded SQLite, 9Router-X is re-architected for multi-agent workloads, heavy CLI concurrency, and production deployments.

| Architectural Component | 9Router Original (Upstream) | 9Router-X (Enterprise Edition) |
|---|---|---|
| **Database Engine** | SQLite file-based (`data.sqlite`) / `better-sqlite3` / `sql.js` (subject to file locks under concurrency) | **Pure PostgreSQL 17** — connection pool, true ACID, row-level locking, zero file-lock contention |
| **Caching & Cooldown (L2)** | In-memory JavaScript `Map` (wiped on server restarts or container redeploys) | **Valkey 8 / Redis Speed Layer** — persistent TTL cooldowns, distributed OAuth refresh locks, instant cross-worker failover |
| **Usage & Request Logging** | Monolithic tables / text files (bloats with high token volume) | **Native Monthly Table Partitioning** (`usage_history`, `request_details`) — instant $O(1)$ partition maintenance |
| **Load Balancing & Account Rotation** | Strict sequential fallback | **Optimistic Fair-Share Balancing + Jitter** — prevents burst rate-limit bans across multiple provider accounts |
| **Quota Cooldown Behavior** | 3-day permanent freeze upon quota exhaustion | **Smart 24-Hour Cooldown Cap** — auto-recovers on rolling quotas without manual unfreeze interventions |
| **Client Error Isolation** | Client-side 4xx errors could freeze upstream accounts | **Strict Error Isolation** — client 400/404/413 errors never trigger provider account lockout |
| **Token Optimization Pipeline** | Local RTK tool-result compression only | **RTK + Headroom Sidecar Support** — automated context compression for OpenAI, Claude, Kiro, and Codex |
| **Migration & Backup Compatibility** | SQLite-only backup | **Bi-Directional Migration** — seamless import of official 9Router backup JSON into PostgreSQL |
| **Target Deployment** | Local Node/Bun Desktop CLI tray | **Containerized All-in-One Docker Stack** (Gateway + PostgreSQL + Valkey + Headroom) |

---

## 🤔 Why 9Router-X?

**Stop wasting budget, tokens, and hitting concurrency blocks:**

- ❌ Rate limits freeze coding sessions mid-workflow
- ❌ Expensive provider subscriptions expire unused each month
- ❌ File-based SQLite locks crash under parallel agents or concurrent CLI calls
- ❌ Massive tool outputs (`git diff`, `grep`, `test` logs) burn context windows quickly
- ❌ Upstream quota locks require manual restarts or database edits

**9Router-X solves this:**

- ✅ **Dual Token Savers (RTK + Headroom)** — Cut tool outputs (20-40%) and compress conversational context on the fly
- ✅ **PostgreSQL 17 Backend** — Handle hundreds of concurrent agent requests without locked database errors
- ✅ **Valkey/Redis Speed Layer** — Cache cooldown states and coordinate token refreshes across instances
- ✅ **Automated 3-Tier Fallback** — Subscription $\rightarrow$ Cheap $\rightarrow$ Free with zero coding interruptions
- ✅ **Universal Protocol Translation** — Works with Claude Code, Codex CLI, Cursor, Cline, OpenClaw, Antigravity, and any OpenAI-compatible client

---

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ Your CLI Coding Tools                                       │
│ (Claude Code, Codex, OpenClaw, Cursor, Cline, Antigravity)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ http://localhost:10128/v1
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ 9Router-X Gateway Engine (Next.js 16 Standalone)            │
│  • RTK Token Compression (in-flight tool_result filter)     │
│  • Headroom Sidecar Proxy (context window compaction)       │
│  • Format Translation (OpenAI ↔ Claude ↔ Gemini ↔ Codex)    │
│  • Fair-Share Account Balancing & Cooldown Management       │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
       (ACID Persistence)              (L2 Cache & Locks)
               ↓                              ↓
      ┌──────────────────┐          ┌──────────────────┐
      │  PostgreSQL 17   │          │ Valkey 8 / Redis │
      │ (Partitioned DB) │          │  (TTL Speed Layer)│
      └──────────────────┘          └──────────────────┘
               │
               ├─→ [Tier 1: SUBSCRIPTION] Claude Code, Codex, GitHub Copilot
               │   ↓ quota reached / rate limited
               ├─→ [Tier 2: CHEAP] GLM ($0.6/1M), MiniMax ($0.2/1M), Kimi
               │   ↓ budget ceiling
               └─→ [Tier 3: FREE] Kiro AI, OpenCode Free, Vertex AI credits

Result: Continuous coding, rock-solid stability under load, minimal token costs.
```

---

## 🚀 Quick Start (Docker Compose - Recommended)

The all-in-one Docker Compose stack orchestrates:
- **9router-x** (Gateway & Dashboard): `http://localhost:10128`
- **postgres** (PostgreSQL 17 with healthcheck): port `5432`
- **redis** (Valkey 8 / Redis compatible): port `6381` mapped to internal `6379`
- **headroom** (LLM Context Compression Proxy): `http://localhost:8787`

### 1. Clone & Configure

```bash
git clone https://github.com/rickicode/9router-X.git
cd 9router-X

cp .env.example .env
```

Generate secrets for `.env` (e.g. using `openssl rand -hex 32`):
- `JWT_SECRET` — Session cookie signing key
- `INITIAL_PASSWORD` — Initial dashboard admin password
- `API_KEY_SECRET` — HMAC secret for gateway tokens
- `POSTGRES_PASSWORD` — PostgreSQL authentication password
- `REDIS_PASSWORD` — Valkey/Redis authentication password

### 2. Launch Container Stack

```bash
docker compose up -d --build
```

### 3. Open Dashboards
- **9Router-X Dashboard**: `http://localhost:10128/dashboard`
- **Headroom Dashboard**: `http://localhost:8787/dashboard` (API docs: `http://localhost:8787/docs`)

### 4. Connect a Provider & Code
1. Open `http://localhost:10128/dashboard` $\rightarrow$ **Providers**.
2. Connect **Kiro AI** (free tier: Claude 4.5 + GLM-5 + MiniMax) or paste your API keys.
3. Configure your CLI tool to use `http://localhost:10128/v1`.

---

## 🛠️ Supported CLI Tools

9Router-X integrates with all major AI development tools:

<div align="center">
  <table>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/claude.png" width="60" alt="Claude Code"/><br/>
        <b>Claude Code</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/cursor.png" width="60" alt="Cursor"/><br/>
        <b>Cursor</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/codex.png" width="60" alt="Codex"/><br/>
        <b>Codex</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/openclaw.png" width="60" alt="OpenClaw"/><br/>
        <b>OpenClaw</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/copilot.png" width="60" alt="Copilot"/><br/>
        <b>Copilot</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/antigravity.png" width="60" alt="Antigravity"/><br/>
        <b>Antigravity</b>
      </td>
    </tr>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/cline.png" width="60" alt="Cline"/><br/>
        <b>Cline</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/continue.png" width="60" alt="Continue"/><br/>
        <b>Continue</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/roo.png" width="60" alt="Roo"/><br/>
        <b>Roo</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/droid.png" width="60" alt="Droid"/><br/>
        <b>Droid</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/opencode.png" width="60" alt="OpenCode"/><br/>
        <b>OpenCode</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/kilocode.png" width="60" alt="Kilo Code"/><br/>
        <b>Kilo Code</b>
      </td>
    </tr>
  </table>
</div>

---

## 🌐 Supported Providers

### 🔐 OAuth Providers
- **Claude Code** (Anthropic Claude 4.5 / 4.6 / Opus / Sonnet / Haiku)
- **OpenAI Codex** (Codex Plus / Pro / GPT-5 series)
- **GitHub Copilot** (GPT-5.4, Claude Opus, Sonnet, Gemini 3.1)
- **Cursor IDE** (Claude 4.6 Opus, Sonnet Thinking, GPT-5.3)
- **Antigravity & Kimchi**

### 🆓 Free Providers
- **Kiro AI**: Claude 4.5 + GLM-5 + MiniMax (~50 free monthly credits + 500 trial credits)
- **OpenCode Free**: Zero-auth passthrough proxy with live model fetching
- **Vertex AI Studio**: $300 free trial credits for eligible Google Cloud accounts

### 🔑 API Key Providers (40+)
- **OpenRouter, GLM (Zhipu), MiniMax, Kimi (Moonshot), DeepSeek, Groq, xAI (Grok), Mistral, Perplexity**
- **Together AI, Fireworks, Cerebras, Cohere, NVIDIA, SiliconFlow, Nebius, Chutes**
- **Custom OpenAI / Anthropic Compatible Endpoints** (vLLM, Ollama, LocalAI, LM Studio)

### 🏠 Self-Hosted Speech & Embeddings
- **Speech-to-Text (STT)**: whisper.cpp, faster-whisper (`/v1/audio/transcriptions`)
- **Text-to-Speech (TTS)**: Kokoro-FastAPI, openedai-speech (`/v1/audio/speech`)
- **Embeddings**: llama-server, vLLM, Infinity, text-embeddings-inference (`/v1/embeddings`)

---

## 💡 Key Features

| Feature | What It Does | Why It Matters |
|---|---|---|
| 🐘 **PostgreSQL 17 ACID Backend** | Multi-connection pooling with monthly log partitioning | Eliminates SQLite lock contention during parallel agent calls |
| ⚡ **Valkey 8 / Redis L2 Layer** | Distributed TTL cache for provider cooldowns and OAuth locks | Instant recovery, persistent state across server restarts |
| 🚀 **RTK Token Saver** | Compresses tool outputs (`git diff`, `grep`, `ls`, logs) before LLM | **Saves 20-40% prompt tokens** per request |
| 🧠 **Headroom Token Saver** | Automates conversation context compression via sidecar proxy | Preserves long conversation memory with smaller context footprints |
| 🪨 **Caveman Mode** | Injects concise-prompt instructions while keeping technical fidelity | **Saves up to 65% output tokens** |
| 🐴 **Ponytail** | Injects pragmatic senior-dev rules (stdlib first, YAGNI) | Shorter code diffs and fewer output tokens |
| 🎯 **Smart 3-Tier Fallback** | Auto-fallback: Subscription $\rightarrow$ Cheap $\rightarrow$ Free | Prevents interruptions when quotas run out |
| 📊 **Real-Time Quota Tracking** | Live usage tracking with auto-reset countdowns | Maximizes return on active subscriptions |
| 🔄 **Protocol Translation** | OpenAI $\leftrightarrow$ Claude $\leftrightarrow$ Gemini $\leftrightarrow$ Codex $\leftrightarrow$ Kiro | Run any model on any client without code changes |
| 👥 **Fair-Share Balancing** | Jitter-based account rotation across multiple credentials | Avoids synchronized rate-limit exhaustion |
| 💾 **Data Migration** | Full compatibility with upstream 9Router backup files | Effortless transition from SQLite to PostgreSQL |

---

## 📦 Data Migration from Official 9Router

### Method 1: Web Dashboard (Easiest)
1. In your existing official 9Router, open **Profile / Settings** $\rightarrow$ click **Download Backup**.
2. Open 9Router-X Dashboard (`http://localhost:10128/dashboard/profile`).
3. Select the backup JSON file and click **Restore / Import Backup**. 9Router-X automatically migrates the payload into PostgreSQL.

### Method 2: CLI Migration Script
If you have direct access to your old `data.sqlite` file:
```bash
node scripts/migrate-sqlite-to-pg.mjs --sqlite /path/to/data.sqlite
```

---

## 📖 Setup Guide

<details>
<summary><b>🔧 CLI Client Configuration</b></summary>

### Claude Code
Configure `~/.claude/config.json`:
```json
{
  "anthropic_api_base": "http://localhost:10128/v1",
  "anthropic_api_key": "your-9router-key"
}
```

### Cursor IDE
Navigate to **Settings** $\rightarrow$ **Models** $\rightarrow$ **OpenAI API**:
- **Base URL**: `http://localhost:10128/v1`
- **API Key**: `[paste key from 9router dashboard]`
- **Model**: `cc/claude-opus-4-7` or custom combo name

### OpenAI Codex CLI
```bash
export OPENAI_BASE_URL="http://localhost:10128"
export OPENAI_API_KEY="your-9router-key"

codex "refactor authentication module"
```

### OpenClaw
Edit `~/.openclaw/openclaw.json`:
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "9router/kr/claude-sonnet-4.5"
      }
    }
  },
  "models": {
    "providers": {
      "9router": {
        "baseUrl": "http://127.0.0.1:10128/v1",
        "apiKey": "sk_9router",
        "api": "openai-completions",
        "models": [
          {
            "id": "kr/claude-sonnet-4.5",
            "name": "Claude Sonnet 4.5 (Kiro Free)"
          }
        ]
      }
    }
  }
}
```
*(Note: Use `127.0.0.1` instead of `localhost` in OpenClaw configurations).*

### Cline / RooCode / Continue
- **API Provider**: OpenAI Compatible
- **Base URL**: `http://localhost:10128/v1`
- **API Key**: `[from dashboard]`
- **Model**: `cc/claude-opus-4-7` or combo name

</details>

<details>
<summary><b>🎨 Creating Resilient Combos</b></summary>

Combine multiple tiers into a single virtual model endpoint in **Dashboard** $\rightarrow$ **Combos**:

```
Combo Name: "production-stack"
Priority Order:
  1. cc/claude-opus-4-7      (Subscription primary)
  2. cx/gpt-5.5              (Secondary subscription)
  3. glm/glm-5.1             (Cheap backup, $0.6/1M)
  4. minimax/MiniMax-M2.7    (Ultra-cheap long context, $0.2/1M)
  5. kr/claude-sonnet-4.5    (Free emergency fallback via Kiro)
```

Point your client to model `production-stack`. 9Router-X automatically traverses the priority chain if any provider returns rate limits, authentication timeouts, or service degradation.

</details>

<details>
<summary><b>🛠️ Local Source Development (Without Docker)</b></summary>

Running without Docker requires external PostgreSQL 17 and Valkey/Redis instances accessible locally.

```bash
git clone https://github.com/rickicode/9router-X.git
cd 9router-X

cp .env.example .env
# Configure DATABASE_URL and REDIS_URL in .env

npm install

# Start Next.js development server
npm run dev

# Or build for production
npm run build
npm run start
```

Run test suites:
```bash
npm install
cd tests && npm install
npx vitest run unit/postgres-e2e.test.js
```

</details>

---

## 📝 API Reference

### OpenAI-Compatible Chat Completions
```bash
curl -X POST http://localhost:10128/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kr/claude-sonnet-4.5",
    "messages": [
      {"role": "user", "content": "Explain vector clocks briefly."}
    ],
    "stream": true
  }'
```

### List Available Models & Combos
```bash
curl http://localhost:10128/v1/models \
  -H "Authorization: Bearer your-api-key"
```

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 22+ / Docker
- **App Framework**: Next.js 16 (App Router + Standalone Output)
- **Primary Database**: PostgreSQL 17 (Connection Pool, Partitioned History)
- **Speed Layer & Cache**: Valkey 8 / Redis 7+
- **Context Optimizer**: Headroom AI Sidecar Proxy (Python FastAPI)
- **Frontend UI**: React 19 + Tailwind CSS 4
- **Streaming Engine**: Server-Sent Events (SSE) protocol translator

---

## 🙏 Acknowledgments & Credits

9Router-X is built upon outstanding open-source projects:

- **[decolua/9router](https://github.com/decolua/9router)** — The foundational AI router and dashboard architecture created by [@decolua](https://github.com/decolua).
- **[RTK](https://github.com/rtk-ai/rtk)** — High-efficiency lossless token-saver algorithm.
- **[Headroom](https://github.com/chopratejas/headroom)** — Context compression proxy for large conversation histories.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** by [@JuliusBrussee](https://github.com/JuliusBrussee) — Concise prompt efficiency methodology.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** by [@DietrichGebert](https://github.com/DietrichGebert) — Minimalist senior developer prompting heuristics.
- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** — Early architecture inspiration for CLI AI proxies.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

<div align="center">
  <sub>Built for reliable 24/7 AI development under production workloads.</sub>
</div>
