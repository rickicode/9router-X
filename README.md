# 9Router X Edition

High-performance, enterprise-grade AI routing gateway with provider fallback, smart load balancing, and token-saving features.

This is an enhanced high-concurrency fork of [decolua/9router](https://github.com/decolua/9router) refactored for production-scale workloads.

---

## ⚠️ Mengapa Wajib Menggunakan Docker? (All-in-One Architecture)

Berbeda dengan 9Router original yang dirancang sebagai desktop tray/aplikasi single-binary berbasis embedded SQLite lokal, **9Router-X adalah sistem enterprise multi-komponen**:
1. **Engine Utama (9Router-X)**: Next.js 16 standalone server.
2. **Database Primer**: **PostgreSQL 17** (ACID pool, monthly partitioned tables).
3. **Speed Layer & Cache**: **Valkey 8 / Redis** (instant cooldown, locks, & session routing).
4. **Token Optimizer**: **Headroom** (Python AI sidecar context compression proxy).

> 💡 **Rekomendasi Utama: Selalu gunakan `docker compose`**. 
> Menjalankan secara manual (bare metal) mewajibkan Anda menginstal, mengonfigurasi, dan me-manage instance PostgreSQL, Redis, dan Headroom Python environment secara terpisah. Docker Compose mengorkestrasi seluruh stack ini dalam satu perintah `docker compose up -d` siap pakai.

---

## ⚡ Perbedaan Utama: 9Router-X vs 9Router Original

| Fitur / Arsitektur | 9Router Original | 9Router-X (Fork) |
|---|---|---|
| **Kebutuhan Runtime** | Standalone Node/Bun (Zero external services) | **Docker Stack Terorkestrasi (Wajib Docker untuk All-in-One)** |
| **Database Engine** | SQLite file-based (`~/.9router/db/data.sqlite`) / `better-sqlite3` / `sql.js` (raw file locks) | **PostgreSQL Only (`postgres:17`)** — full ACID, pool connection, zero file-lock concurrency bottlenecks |
| **Caching & Cooldown (L2)** | In-memory JavaScript Map (hilang jika server restart/redeploy) | **Redis L2 Speed Layer (`valkey/valkey:8` / Redis 7+)** — TTL cooldown cache, distributed lock OAuth refresh, & instant failover |
| **Log & History Scale** | Single-table SQLite / JSON append file (raw bloat jika jutaan logs) | **Native Table Partitioning Bulanan** (`usage_history`, `request_details`) — drop partisi lama instan $O(1)$ |
| **Load Balancing Router** | Strict sequential fallback | **Optimistic Fair-Share Balancing + Jitter** — rotasi akun pintar menghindari ban/exhaustion serentak |
| **Quota & Model Cooldown** | Lock permanen 3 hari untuk semua jenis exhaustion | **Smart 24-Hour Cooldown Cap** — kuota ter-reset otomatis max 24 jam tanpa perlu unfreeze manual |
| **Request-Error Handling** | 400 Bad Request client kadang mengunci akun | **Strict Error Isolation** — error 400/404/413 dari client tidak pernah mengunci akun provider |
| **Context Compression** | Hanya RTK tool_result compression lokal | **Headroom Sidecar Support** — kompresi context window otomatis untuk OpenAI, Claude, Kiro & Codex |
| **Multi-Provider & Backup** | Backup SQLite internal | **Dual Support Backup** — kompatibel import data backup official 9Router (SQLite JSON) ke 9Router-X (Postgres) |
| **Deployment Target** | Single Node Desktop Tray / Local Bun | **Production Docker Stack First** (Gateway + PostgreSQL + Valkey/Redis + Headroom) |

---

## 🚀 Quick Start (Docker Compose - Recommended)

Stack Docker Compose 9Router-X menyertakan container:
- **9router-x** (Next.js 16 Gateway & Dashboard): port `10128`
- **postgres** (PostgreSQL 17): port `5432`
- **redis** (Valkey 8 / Redis compatible): port `${REDIS_PORT:-6381}` mapped ke internal `6379`
- **headroom** (LLM Context Compression Proxy): port `8787`

1. Salin file environment:
   ```bash
   cp .env.example .env
   ```
2. Isi rahasia keamanan di `.env` (misal via `openssl rand -hex 32`):
   - `JWT_SECRET`
   - `INITIAL_PASSWORD` (password admin dashboard pertama kali)
   - `API_KEY_SECRET`
   - `MACHINE_ID_SALT`
   - `POSTGRES_PASSWORD`
   - `REDIS_PASSWORD`

3. Jalankan container stack:
   ```bash
   docker compose up -d --build
   ```

4. Buka Dashboard:
   - **9Router Dashboard**: `http://localhost:10128/dashboard`
   - **Headroom Dashboard**: `http://localhost:8787/dashboard` (atau docs: `http://localhost:8787/docs`)

---

## 🧠 Headroom Integration

Headroom adalah layer kompresi konteks LLM otomatis untuk memangkas pemakaian token dan biaya:

- **Cara Kerja**: Sebelum 9Router meneruskan request ke upstream LLM, riwayat `messages[]` dikompresi via Headroom proxy (`http://headroom:8787/v1/compress`).
- **Format Didukung**:
  - `openai` / OpenAI-compatible (OpenRouter, DeepSeek, Groq, dll.)
  - `claude` (Anthropic — auto translate $\leftrightarrow$ OpenAI)
  - `openai-responses` (Codex)
  - `kiro`
- **Akses Langsung / Standalone**:
  - Web UI: `http://localhost:8787/dashboard`
  - Stats & Metrics: `http://localhost:8787/stats` & `http://localhost:8787/metrics`
  - Claude Code via Headroom: `ANTHROPIC_BASE_URL=http://localhost:8787 claude`

---

## 📦 Migrasi Data dari 9Router Official

9Router-X mendukung dua cara migrasi data dari instalasi 9Router lama:

### Cara 1: Via Dashboard Import (Paling Mudah)
1. Di 9Router official lama, buka menu **Settings / Profile** $\rightarrow$ klik tombol **Download Backup**.
2. Di dashboard 9Router-X baru (`/dashboard/profile`), pilih file JSON backup tersebut lalu klik **Restore / Import Backup**.
3. Sistem secara otomatis menormalisasi format SQLite ke PostgreSQL schema.

### Cara 2: Via Standalone Script CLI
Jika memiliki akses langsung ke file `data.sqlite` lama:
```bash
node scripts/migrate-sqlite-to-pg.mjs --sqlite /path/to/data.sqlite
```

---

## 🛠️ Menjalankan dari Source (Development)

> ⚠️ **Catatan**: Menjalankan tanpa Docker hanya disarankan untuk development core Next.js. Anda wajib memiliki instance PostgreSQL dan Redis yang aktif secara manual.

Requirements: Node.js 22+ & PostgreSQL running.

```bash
git clone https://github.com/rickicode/9router-X.git
cd 9router-X

cp .env.example .env
# Sesuaikan DATABASE_URL dan REDIS_URL di .env

npm install

# Jalankan dev server
npm run dev

# Atau production build
npm run build
npm run start
```

Dashboard terbuka di `http://localhost:10128/dashboard` (atau port default `PORT` yang diset).

---

## 📚 Info & Referensi

- **Dokumen Blueprint Arsitektur Lengkap**: [PLAN.md](PLAN.md)
- **Upstream Project**: [decolua/9router](https://github.com/decolua/9router)
- **Upstream Docs**: [DOCKER.md](DOCKER.md) • [ARCHITECTURE.md](docs/ARCHITECTURE.md)
