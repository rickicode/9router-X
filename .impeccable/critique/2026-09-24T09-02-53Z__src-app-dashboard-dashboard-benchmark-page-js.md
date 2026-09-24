---
target: src/app/(dashboard)/dashboard/benchmark/page.js
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/workspaces/9router-X-ui/src/app/(dashboard)/dashboard/benchmark/page.js"
target_fingerprint: "sha256:5d2ade8fccbbefcb91a1eb8adcb974d50f6c4041f1a6f276c847e66f278f09de"
target_path: /workspaces/9router-X-ui/src/app/(dashboard)/dashboard/benchmark/page.js
timestamp: 2026-09-24T09-02-53Z
slug: src-app-dashboard-dashboard-benchmark-page-js
---
# Assessment Report: 9router-X AI Model Benchmark

**Target**: `src/app/(dashboard)/dashboard/benchmark/page.js`  
**Live URL**: `http://192.168.90.101:10128/dashboard/benchmark`  
**Method**: dual-agent (A: BenchmarkCritiqueA · B: BenchmarkEvidenceB)

---

## 1. Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | **3** | Progress bar and 4 status tiles are clear, but fast-tick polling lags at 3s/8s and ETA/time remaining is missing. |
| 2 | Match System / Real World | **2** | Heavy mixed Indonesian and English ("LIVE", "Show Logs", "PONG Gate", "TTFT"). 80/50 score thresholds have no explanation. |
| 3 | User Control and Freedom | **3** | Good cancel action and staged buffer, but ESC only works in logs modal (picker, reviewer, inspector lack ESC). |
| 4 | Consistency and Standards | **2** | Broken numbering: cards 1, 2, and 3 skip the active-job card entirely. Badges show rate-limited as red error in inspector but amber in table. |
| 5 | Error Prevention | **2** | No confirmation before running hundreds of calls. Native `confirm()` used for delete. Retention save does not check API response. |
| 6 | Recognition Rather Than Recall | **3** | Good provider grouping and empty states, but custom reviewer requires exact alias string. |
| 7 | Flexibility and Efficiency | **3** | Great search, select-all, expand/collapse, but focus is not trapped in modals and default sort has no visible column. |
| 8 | Aesthetic and Minimalist Design | **2** | Overcrowded 10-column table and dense stacked blocks with 10–11px type signaling raw console instead of refined product. |
| 9 | Error Recovery | **2** | `handleSaveRetention` shows "Tersimpan!" unconditionally even when API fails. Copy buttons have no feedback. |
| 10 | Help and Documentation | **2** | Subtitles present, but no explanation of what suites test (e.g. TokenBucketRateLimiter) or how judge-router scores. |
| **Total** | | **24/40** | **Needs Work (Fair)** |

---

## 2. Design Specificity Verdict

**Verdict**: **Authored for 9router — not generic template slop.**
- Strong domain-specific features: PONG Gate liveness prerequisite, 429 rate limit retry queues, per-attempt account names, internal `judge-router` reviewer.
- **Detector Scan (Evidence B)**:
  - 35 of 50 interactive targets are sub-44px on mobile (checkboxes 13x13, filter pills 24px height, search inputs 26px/32px, action buttons 22px).
  - No viewport horizontal overflow (390px client width = 390px scroll width), but two tables scroll horizontally inside cards.
  - Severe language fragmentation: 121 lexical Indonesian nodes mixed with English structural labels across every card.

---

## 3. Overall Impression
A feature-dense, capable engineering tool with genuine domain depth, but it is currently unpolished and feels like an "Indonesian island" inside an otherwise English application. Mobile usability is severely compromised by 35 sub-44px click targets, broken card numbering, and lack of run confirmation for mass API execution.

---

## 4. What's Working
1. **Domain-accurate Architecture**: PONG gate as prerequisite, 429 retry queue visualization, and raw payload inspectability speak directly to gateway operators.
2. **Staged Model Selection Buffer**: Model picker allows staging selections with "Batal" / "Terapkan", preventing accidental changes during ongoing tasks.
3. **Active Job Feedback**: Live pulse badge, progress bar with state transitions, and real-time log modal provide high reassurance during active execution.

---

## 5. Priority Issues

### [P0] 35 Sub-44px Interactive Targets on Mobile
- **Why it matters**: Severe mobile usability barrier. Suite checkboxes are 13×13px, filter buttons are 22–24px tall, and delete/inspect buttons are below touch floor standards.
- **Fix**: Apply `min-h-11 min-w-11 sm:min-h-0 sm:min-w-0` to all buttons, convert filter pills to `SegmentedControl size="touch" snap`, and increase checkbox touch padding.
- **Suggested command**: `$impeccable adapt`

### [P1] Language Inconsistency (Indonesian Island in English App)
- **Why it matters**: Sibling pages (Usage, Providers, Combos, Endpoint) are English. Benchmark page uses Indonesian with leaked English words ("Show Logs", "Filter: Semua", "PONG Gate", "LIVE").
- **Fix**: Standardize all copy to clean, professional English matching the rest of the 9router dashboard.
- **Suggested command**: `$impeccable clarify`

### [P1] False-Success Feedback on Retention Settings Save
- **Why it matters**: `handleSaveRetention` displays "Tersimpan!" for 2.5s without checking `res.ok` or handling network exceptions. Users believe settings persisted when they may have failed.
- **Fix**: Await `res.ok`, show error state if unsuccessful, and provide retry feedback.
- **Suggested command**: `$impeccable harden`

### [P1] Missing High-Stakes Run Confirmation
- **Why it matters**: One click triggers hundreds of live provider calls without confirmation, and defaults automatically select 41+ models across multiple providers.
- **Fix**: Add a confirmation modal displaying: Total Estimated Calls, Model count, and Quota warning before firing the batch.
- **Suggested command**: `$impeccable onboard`

### [P2] Broken Card Hierarchy & Numbering
- **Why it matters**: Cards are labeled "1. Konfigurasi", "2. Target Model", and "3. Hasil Pengujian", but the Active Job card appears unnumbered between 2 and 3, and bottom cards have no numbers.
- **Fix**: Remove numbers and use clean section titles, or reorder into a natural workflow.
- **Suggested command**: `$impeccable layout`

---

## 6. Persona Red Flags

- **Alex (Power User)**: Loves raw request/response inspector and TTFT metrics, but frustrated by lack of CSV/JSON export and 3s polling lag without true SSE streaming.
- **Jordan (First-Timer)**: Overwhelmed by 41 pre-selected models, confused by unexplained jargon ("PONG Gate", "TokenBucketRateLimiter"), and disoriented by Indonesian/English language mismatch.
- **Sam (Busy PM)**: Cannot find high-level pass/fail summary without digging into 10-column table; reviewer summary report is buried mid-page.

---

## 7. Minor Observations
- Modal accessibility is incomplete: picker and reviewer modals lack ESC key handling, focus trapping, and body-scroll locking.
- Inspector modal maps `rate_limited` and `skipped` to red `error` badge variant, whereas results table colors them amber.
- Results table default sort (`created_at`) has no visible column or sort indicator.
