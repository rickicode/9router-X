---
name: upstream-sync
description: Internal skill for inspecting, comparing, and tracking upstream `decolua/9router` releases and commits against the AxonRouter codebase (baseline v0.5.81). Use this whenever checking upstream changes, reviewing what features decolua has released, or determining which fixes should be cherry-picked into AxonRouter.
---

# Upstream Sync & Quality Curation Skill (AxonRouter)

Internal guide and memory ledger for tracking the original upstream repository:
- **Upstream Repository**: `https://github.com/decolua/9router`
- **AxonRouter Baseline**: `v0.5.81`
- **Current AxonRouter Version**: `v0.1.2`
- **Memory Ledger**: `.agent/upstream-comparison.json`

---

## 1. Prinsip Utama: Kurasi Ketat (Wajib Versi Terbaik)

> **Aturan Wajib:**
> Jika ingin sync atau backport fitur dari `decolua/9router`, **wajib ambil versi terbaiknya saja**.
> Jika implementasi atau kode dari 9router **kurang oke, lambat, hacky, atau menurunkan stabilitas/efisiensi**, **JANGAN DI-ADD**.

### Kriteria Kelayakan (Quality Gate):
1. **Docker-First & High Concurrency**:
   - Upstream sering menambahkan kode desktop (Electron, tray, dialog OS, autostart, child_process lokal). **TOLAK** semua kode desktop.
2. **Kualitas Arsitektur**:
   - Upstream menggunakan file JSON / lowdb / SQLite mentah di disk. AxonRouter menggunakan arsitektur PostgreSQL 17 murni dengan connection pool + L2 cache. Jangan masukkan logika sinkronisasi disk lowdb ke AxonRouter.
3. **Gateway Performance**:
   - Endpoint publik `/v1/*` di AxonRouter dilayani oleh Hono container terpisah (`axonrouter-api`, port 10129) dengan 4 cluster worker (p95 = 11ms). Jangan biarkan ada middleware upstream yang membendung event loop atau memicu I/O sinkron di hot path.
4. **Fitur Provider Baru / Translator**:
   - Jika upstream menambah provider/model baru (misal: Claude Opus 5.5, Qoder CN, MiMo update), periksa implementasinya:
     - Jika bersih dan sesuai web standard Request/Response: **ADOPT**.
     - Jika implementasinya berantakan atau membuat request lambat: **REWRITE** sesuai standar AxonRouter sebelum digabung, atau **LEWATKAN** jika tidak esensial.

---

## 2. Quick Check Tool

Jalankan script komparator internal untuk memeriksa rilis npm dan commit terbaru upstream:

```bash
# Periksa status upstream vs lokal
node .agent/scripts/check-upstream.mjs

# Periksa dan perbarui timestamp serta commit SHA di .agent/upstream-comparison.json
node .agent/scripts/check-upstream.mjs --save
```

---

## 3. Cara Membandingkan Commit / Diff Upstream

Ketika mengevaluasi perubahan baru dari upstream `decolua/9router`:

```bash
# Periksa ringkasan commit antara baseline kita (v0.5.81) dan upstream master
curl -s "https://api.github.com/repos/decolua/9router/compare/v0.5.81...master" | jq -r '.commits[].commit.message' | grep -E '^#|^##|^- \*\*'

# Periksa file-file yang disentuh pada commit tertentu
curl -s "https://api.github.com/repos/decolua/9router/commits/<COMMIT_SHA>" | jq '{message: .commit.message, files: [.files[].filename]}'
```

---

## 4. Matriks Keputusan Backport

| Jenis Perubahan Upstream | Kebijakan AxonRouter | Tindakan |
|---|---|---|
| **Model / Provider Baru** (misal Claude Opus 5.5) | Selektif | Cek file registry di `open-sse/providers/registry/`. Jika implementasi bersih, adopsi. |
| **Bugfix Translator / SSE** | Selektif | Adopsi perbaikan stop_reason atau token count jika terbukti valid lewat unit test. |
| **CLI Tools / TUI Menu / Tray** | **TOLAK KERAS** | Dihapus permanen demi efisiensi container Docker. |
| **MITM / Root CA / DNS Hacks** | **TOLAK KERAS** | Digantikan sepenuhnya oleh Hono gateway mandiri (`axonrouter-api`). |
| **Storage JSON / LowDB hacks** | **TOLAK KERAS** | Arsitektur AxonRouter adalah PostgreSQL 17 enterprise. |

---

## 5. Memperbarui Memory Ledger

Setiap kali ada fitur upstream yang dievaluasi:
1. Buka `.agent/upstream-comparison.json`.
2. Masukkan item yang sudah diuji ke `mergedOrExcludedChanges` dengan alasan yang jelas (`accepted` / `rejected` / `rewritten`).
3. Simpan tag/commit upstream terakhir yang telah diverifikasi.
