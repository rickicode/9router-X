---
target: src/app/(dashboard)/dashboard/usage/page.js
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/workspaces/axonrouter-X-ui/src/app/(dashboard)/dashboard/usage/page.js"
target_fingerprint: "sha256:8a7dee72779af5254449a28947ef14ff896d9fd99af564a99a1b1ed5f5bdf7c6"
target_path: /workspaces/axonrouter-X-ui/src/app/(dashboard)/dashboard/usage/page.js
timestamp: 2026-09-23T19-29-37Z
slug: src-app-dashboard-dashboard-usage-page-js
---
# Re-Critique: Usage & Analytics — post mobile-overhaul

Method: independent verification run (UsageRecritique)

**Target**: `src/app/(dashboard)/dashboard/usage/page.js`
**Live URL**: `http://192.168.90.101:10128/dashboard/usage?tab=overview`

### Design Health Score: 30/40 (Good band, 28-35) — up from 23/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeletons, role=status spinners, aria-live, SSE + 60s poll with document.hidden pause; gap: no "data as of HH:MM" stamp. |
| 2 | Match System / Real World | 3 | Plain operator language; RequestLogger still mixes Indonesian (Semua/Gagal/Memuat log) in an English page. |
| 3 | User Control and Freedom | 4 | Retry on every error, deep-linkable state, expanded-row persistence, no destructive read paths. |
| 4 | Consistency and Standards | 3 | One touch control system (44px floors across Segment/Button/Toggle/Tooltip); gap: two different Costs/Tokens toggle styles on breakdown. |
| 5 | Error Prevention | 3 | URL state, AbortController on rapid switches, pending highlighted. |
| 6 | Recognition Rather Than Recall | 4 | BlockGrid labelled rows, RequestStream inline counts, GridLegend scale; hover no longer required on mobile. |
| 7 | Flexibility and Efficiency | 2 | Deep links + keyboard nav, but no export/bulk/jump-to-logs. |
| 8 | Aesthetic and Minimalist Design | 3 | Chrome collapsed; minor desktop column duplication (tokens + costs shown together). |
| 9 | Error Recovery | 3 | role=alert plain-language banners with Retry; empty states name the missing thing. |
| 10 | Help and Documentation | 3 | TAB_COPY inline scope notes + tooltips; acceptable for operator dashboard. |

### Mobile measurements
- 390x844: zero page overflow; inner scroll 2.6 viewports; **0 sub-44px targets** on overview (census of 96 interactive elements; only the 1x1 invisible skip link). Tab strip 1.07x and realtime pills 1.37x are intentional no-scrollbar strips with fade+snap — discoverable, not silent.
- 360x640: zero overflow; **0 sub-44px**; tab strip 393px in 336px wrapper — 57px overflow remains but with fade + snap + auto-scroll (activeTabVisible=true verified); discoverable, not a hard clip.
- Desktop 1440: inner scroll 2513px; one instance each panel (duplicates verified hidden); sticky bar pinned at every depth.

### Cognitive load (2 failures)
- Breakdown cluster stacks 5 sub-44px controls (dimension select 37px, Costs/Tokens pair 28px, chart pills 26px).
- RequestStream zero-traffic buckets render an empty value channel (hover-only for zeros).

### Baseline comparison (23/40 → 30/40)
1. [P0] BlockGrid hover-only — **CLOSED** (labelled-row list <640 with real values, verified).
2. [P0] Tab strip hard-clipped — **CLOSED as UX problem** (57px overflow discoverable via fade+snap+auto-scroll).
3. [P1] 38 sub-44 controls — **PARTIALLY CLOSED** (overview: 0; residual: 5 breakdown controls, new P0).
4. [P1] Realtime pills/RecentRequests silent overflow — **CLOSED** (fade+snap strip; capped 10-row card list with Show more).
5. [P2] 7,720px chrome / three stacked panels — **CLOSED** (desktop 2513px; one switched slot below lg).
6. [P3] Sticky identity columns / out-of-reach controls — **PARTIALLY CLOSED** (sticky bar verified; residual: desktop breakdown ~900px scroller).
Also: AnalyticsModelTable 2.99x — **CLOSED/moot on mobile** (card lists + BlockGrid take over); Estimation tooltip 24px — **CLOSED** (touch trigger 44x44, verified tap-open).

### Remaining issues
- [P0] Breakdown sub-44 controls (UsageChart pills 26px, viewMode pair 28px, dimension select 37px) — UsageChart.js + UsageStats.js breakdown block.
- [P1] Costs/Tokens toggle duplication — one shared viewMode control for both.
- [P1] RequestLogger Indonesian residue (Semua/Gagal/Memuat log) — RequestLogger.js:31-37, 232, 300-303, 436-440.
- [P2] "Estimated, not billed" caveat only behind tooltip — OverviewCards.js cost card inline note.
- [P2] Color-only stream state on mobile cards — add OK/Failed text next to dot (RealtimeRequestRow.js:164+).
- [P3] Future: BlockGrid bucket tap → logs filter.

### Mobile story verdict
Now coherent. Below 640 the page tells one story with hover-only data converted to visible values, one switched live-panel slot, and 44px floors enforced by the shared control set. Remaining seams enumerated; none reintroduce overflow or hidden data.
