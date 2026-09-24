---
target: src/shared/components/RequestLogger.js
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 5
target_identity: "file:/workspaces/9router-X-ui/src/shared/components/RequestLogger.js"
target_fingerprint: "sha256:fcf87e0486103e3d60db3603272af124d3db77dd67db7c04070da36bfa0c8f38"
target_path: /workspaces/9router-X-ui/src/shared/components/RequestLogger.js
timestamp: 2026-09-24T11-00-00Z
slug: src-shared-components-requestlogger-js
---
# Assessment Report: 9router-X Request Logs & Details Consolidation

**Target:** `src/shared/components/RequestLogger.js` (and `src/app/(dashboard)/dashboard/usage/page.js`)
**Live URL:** `http://192.168.90.101:10128/dashboard/usage?tab=logs`
**Commit:** `753a529f`
**Method:** dual-agent (A: LogsCritiqueA · B: LogsCritiqueB deterministic-eval)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Details button toggle gives no visual cue that content expanded 6,800px below viewport; viewport remains at top. |
| 2 | Match System / Real World | 3 | Status filters All/OK/Failed/Pending align with operator vocabulary; hardcoded Indonesian table headers (Waktu, Akun) break consistency. |
| 3 | User Control and Freedom | 2 | Details panel not scrolled into view on open or deep-link; legacy `?tab=details` lacks canonical URL replacement. |
| 4 | Consistency and Standards | 2 | `aria-pressed` used instead of `aria-expanded`/`aria-controls`; top table uses modal inspect while bottom table uses drawer inspect. |
| 5 | Error Prevention | 3 | `AbortController` handles stale requests cleanly; `document.hidden` pauses polling. |
| 6 | Recognition Rather Than Recall | 2 | Top live logger stays on "All" when deep link specifies `status=failed`, creating cognitive contradiction with bottom table. |
| 7 | Flexibility and Efficiency | 2 | Live 3s polling of 200 rows above triggers vertical layout shifts while operator inspects traces below. |
| 8 | Aesthetic and Minimalist Design | 2 | Stacking two full tables creates ~13,000px DOM; status filter row wraps awkwardly to 94px with an orphan button on mobile. |
| 9 | Error Recovery | 3 | Fetch errors surface cleanly; Refresh button allows manual recovery. |
| 10 | Help and Documentation | 2 | Embedded `RequestDetailsTab` lacks section title/subtitle explaining its role vs the live logger above. |
| **Total** | | **23/40** | **Acceptable — structural and ergonomics fixes required** |

## Design Specificity Verdict

**Fragmented integration.** While eliminating the 4th top-level tab simplifies navigation, vertically stacking the live 200-row logger and the archived database query table without viewport management or independent scrolling makes the Details panel practically invisible to operators unless they manually scroll down 6,800px.

**Deterministic scan (Agent B @ 390x844 & 360x800):**
- Horizontal overflow: 0px (`scrollWidth === clientWidth === 390/360`).
- Status filter wrap: Pending button completely visible (`top: 426.5px`, `opacity: 1`, `maskImage: none`, `isInViewportX: true`).
- Details toggle: functional URL state sync (`?details=1`), keyboard Tab + Enter functional.
- Tab strip: exactly 3 tabs (`Overview`, `Analytics`, `Request Logs`).
- Sub-44px targets: 11 controls (skip link 1x1, header icons 40px, tab strip 28px, auto-refresh switch 20x36px).

## Priority Issues

### P0: Broken or Misleading

1. **[P0] Deep-link filter parameters dropped (`provider` and `model`)**
   - **Why it matters**: Clicking "View trace in Request Details" in `FailureResponseModal` drops the specific provider and model the user was investigating; table shows "All Providers".
   - **Fix**: In `src/app/(dashboard)/dashboard/usage/page.js:173`, pass `provider: searchParams.get("provider") || ""` into `initialFilters`.
   - **Suggested command**: `$impeccable harden`

2. **[P0] Viewport disconnect: Details panel hidden 6,800px off-screen on open and deep link**
   - **Why it matters**: Clicking "Details" or arriving via error trace modal leaves viewport at `y=0`. Users perceive the action as broken.
   - **Fix**: Scroll automatically to `#request-details-panel` when `details=1` opens, or confine `RequestLogger` to a scrollable `max-h-[480px]` container.
   - **Suggested command**: `$impeccable layout`

3. **[P0] Filter state contradiction between live logger and details panel**
   - **Why it matters**: URL `?tab=logs&details=1&status=failed` filters the bottom table to failed, but top table shows "All 200" with successful requests.
   - **Fix**: In `RequestLogger.js:94`, initialize `statusFilter` from `searchParams.get("status")`.
   - **Suggested command**: `$impeccable harden`

### P1: Should Fix

4. **[P1] Live 3s polling above causes layout jumps while inspecting traces**
   - **Fix**: Pause `autoRefresh` in `RequestLogger` when `detailsOpen` is active, or use bounded scroll container.
5. **[P1] Non-standard disclosure semantics (`aria-pressed` vs `aria-expanded`) and ambiguous copy**
   - **Fix**: Use `aria-expanded={detailsOpen}`, `aria-controls="request-details-panel"`, label "Detailed Traces" / "Hide Traces".
6. **[P1] Mobile status filter row wraps into an isolated orphan button**
   - **Fix**: Use responsive `grid grid-cols-4 sm:flex` or right-padded horizontal scroll without mask clipping.
7. **[P1] Missing section header and visual boundary for embedded `RequestDetailsTab`**
   - **Fix**: Add distinct header with title "Archived Request Traces" and explanatory subtitle.
8. **[P1] Legacy `?tab=details` URL lacks canonical URL replacement**
   - **Fix**: Run `router.replace` on mount when `tab === "details"` to normalize to `?tab=logs&details=1`.

### P2: Polish

9. **[P2] Unlocalized Indonesian table headers in `RequestLogger.js` (`Waktu` -> `Time`, `Akun` -> `Account`)**
10. **[P2] Copy and icon placement inconsistency across modal deep links**
11. **[P2] Interaction model conflict: Whole-row Modal vs Column-button Drawer**
12. **[P2] Context-free empty state in `RequestDetailsTab`**
13. **[P2] Visual styling disharmony across stacked cards**
