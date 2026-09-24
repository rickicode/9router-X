---
target: src/app/(dashboard)/dashboard/usage/page.js
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/workspaces/axonrouter-X-ui/src/app/(dashboard)/dashboard/usage/page.js"
target_fingerprint: "sha256:26b2d0a0697834dd0fc6b40e0d3fee769000281756d5aebbbbe3f7177cd69f63"
target_path: /workspaces/axonrouter-X-ui/src/app/(dashboard)/dashboard/usage/page.js
timestamp: 2026-09-23T13-42-24Z
slug: src-app-dashboard-dashboard-usage-page-js
---
# Critique: Usage & Analytics — Mobile/Responsive Surface

Method: dual-agent (A: MobileAssessA · B: MobileAssessB)

**Target**: `src/app/(dashboard)/dashboard/usage/page.js`
**Live URL**: `http://192.168.90.101:10128/dashboard/usage?tab=overview`
**Viewports measured**: 360x640, 390x844, 768x1024, 1280x800

---

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The 4-tab strip hard-clips `Request Logs` at 360px (377px of tabs in a 336px wrapper) behind `.no-scrollbar` — no scrollbar, no fade, no snap, so the destination looks absent. |
| 2 | Match System / Real World | 3 | Labels are accurate and domain-true; `Estimated, not billed` is honest. Docked only for `Request Stream` reading as an empty box when live traffic is zero. |
| 3 | User Control and Freedom | 2 | Period is the page's primary control but lives in a header card that scrolls away at y≈350 of a 7,720px page — reachable only by scrolling ~6,000px back up from the breakdown table. |
| 4 | Consistency and Standards | 2 | The `sm:hidden data-cards / hidden sm:block` mobile pattern is applied to only 4 of ~10 table surfaces; `RecentRequests`, `TopProvidersCard`, `AnalyticsModelTable` and `BlockGrid` were left on blind horizontal scroll. The fade mask exists (`.tab-scroll-fade`) but is applied to the sub-tabs and not the main tabs. |
| 5 | Error Prevention | 2 | Period buttons measure 30–48 x 29 CSS px with 4px gaps; a mis-tap silently changes the reporting period and reloads all five metric cards. |
| 6 | Recognition Rather Than Recall | 2 | At 360 the Top Providers table scrolls 588px with no sticky identity column, so row labels are gone by the time you reach P95/Tokens. |
| 7 | Flexibility and Efficiency | 2 | No mobile accelerators; 38 separate sub-44px controls on one 390px viewport. |
| 8 | Aesthetic and Minimalist Design | 2 | 7,720px of single-column desktop chrome in a 796px viewport at 390 — roughly one metric card per screenful. |
| 9 | Error Recovery | 3 | `RequestStream`/`UsageChart` expose real Retry affordances; the failed payload state is recoverable without a reload. |
| 10 | Help and Documentation | 3 | Header prose is accurate and the tooltip carries real content; docked because the 24px tooltip trigger opens a 256px bubble over its own label. |
| **Total** | | **23/40** | **Poor (mobile overhaul required)** |

---

### Deterministic Evidence

- **Document-level horizontal overflow: ZERO at every width and every tab.** `documentElement.scrollWidth === window.innerWidth` at 360, 390, 768 and 1280 across overview/breakdown/analytics/details/logs. The shell's `overflow-hidden` contains everything; the mobile failure mode is **clipping and shrinking**, not spilling.
- **Clipping by `overflow-x: hidden`**: 20 elements at 360/overview, 2 at 390/breakdown. Worst: model ids truncated at a 120px cap with 139px hidden (`google/gemini-3.1-flash-lite` → provider prefix and version suffix destroyed).
- **Horizontal scrollers**: worst measured ratio 2.99x (`AnalyticsModelTable`, 922px content in a 308px wrapper at 360); `AnalyticsRankings` 2.69x; tab strip 1.12x at 360 with no affordance. `ProviderTopology` clips 38px of its canvas at 360 with no scroll path.
- **Interactive targets under 44x44**: 31 at 390/overview, 61 at 390/breakdown. Highest frequency: 40 separate 32px-tall `UsageTable` mobile group expanders (65% of the breakdown total). Also every period button (29px tall), every `RequestStream` filter chip (26px), `Edit rates` (17px), the tooltip trigger (24px).
- **Hover-only controls**: exactly one `opacity-0` control exists — the `Tooltip` bubble. **False positive**: its trigger carries `role="button"`, `tabIndex=0`, `onClick`, `aria-expanded` and Escape dismissal, so touch and keyboard both reach it.
- **Detector**: `impeccable 4.0.0 detect` returns **0 findings** across every usage file, every scope, and the whole of `src/`. Verified genuine, not suppression: no ignore rules exist, and absolute paths to other files in the repo DO return findings. **The bundled detector has no layout, responsive, tap-target or overflow rules** — `--scope layout` returns `[]` for every usage file. It structurally cannot evidence a mobile critique; all findings above come from measurement.
- **Detector URL mode**: 2 `ai-color-palette` warnings (cyan gradient / cyan neon on dark). **False positive** — cyan is the documented brand token (`--color-primary: #06B6D4`) in `globals.css`, not an AI tell. Identical finding set at 390/360/768/1280 confirms the detector is viewport-invariant.

---

### Overall Impression

The page has **no page-level breakage** — nothing spills, nothing overlaps, and the shell adapts correctly. What it lacks is a mobile information architecture: below 640px it is a 7,720px vertical stack of full-chrome desktop panels, and the two components that carry the most information (`BlockGrid`, the wide analytics tables) were never given a small-screen presentation at all.

---

### What's Working

1. **`UsageTable`'s card list** (`sm:hidden data-cards` / `hidden sm:block overflow-x-auto`) is the right pattern, already proven in this codebase — group row → 3-up stats → expandable detail. It is the reference to copy.
2. **`RequestLogger`'s mobile rows**: full-width `w-full text-left p-3` tappable rows with a real 44px+ target, and label-swapping (`Auto Refresh (3s)` → `Auto (3s)`).
3. **The dashboard shell**: `lg:` correctly swaps the 240px sidebar to a focus-trapped off-canvas drawer; the trigger is the only consistently compliant control at `size-11` (44px). The page receives full width at every tested size — the shell never steals mobile width.

---

### Priority Issues (P0–P3)

#### [P0] `BlockGrid` is hover-only and 100% unreachable on touch
- **What**: 288 cells measuring 9.03 x 9.03 CSS px at 390, with the per-bucket value available **only** through the native `title` attribute. The container is `role="img"` with a single `aria-label` announcing the peak.
- **Why it matters**: The Volume Grid is the primary visualisation of the breakdown sub-tab. On a phone its entire data payload is unreachable — not hard to hit, impossible to read. No other finding on this page is this broken.
- **Fix**: Add a `compact` mode below 640 rendering the visible buckets as a vertical list (label, proportional bar, formatted value per row); keep the 31-column grid at ≥640 where cells measure ≥14px. Stage the values as text, not `title`.
- **File**: `src/app/(dashboard)/dashboard/usage/components/BlockGrid.js:43,62-66,76-101`

#### [P0] Top-level tab strip hard-clips a destination with no cue
- **What**: 377px of tabs in a 336px wrapper at 360 (`Request Logs` right edge 384 vs viewport 360); 375px in 366px at 390. Wrapper is `.no-scrollbar` with no fade and no snap.
- **Why it matters**: One of four primary destinations is half-visible and looks absent.
- **Fix**: Apply the existing `tab-scroll-fade` mask (`src/app/globals.css:253-259`), add `scroll-snap-type: x proximity`, and scroll the active tab into view. Below 400px, swap the 4-tab control for a native `<select>` bound to the same router handler.
- **File**: `src/app/(dashboard)/dashboard/usage/page.js:107-113`

#### [P1] Every period/filter control is 26–32px tall
- **What**: 31–61 sub-44px targets per viewport. Period buttons 29px tall with 4px gaps; `RequestStream` chips 26px; top tabs 32px; tooltip 24px.
- **Why it matters**: A mis-tap on the period row changes the reporting window and reloads all five cards.
- **Fix**: Add a `touch` size to `SegmentedControl` (`min-h-11`); raise `Button sm` to `h-10 min-w-10`; give the `RequestStream` chips `min-h-11`; widen the period gap to `gap-1.5`.
- **File**: `src/shared/components/SegmentedControl.js:20-24` · `src/shared/components/Button.js:16` · `src/app/(dashboard)/dashboard/usage/page.js:99`

#### [P1] `RealtimeRequestsCard` pill row and `RecentRequests` overflow silently
- **What**: Pill row measures 445px (right edge 476) at 390 behind `.no-scrollbar` — `Failed(1)` is invisible and therefore looks absent. `RecentRequests` renders a `min-w-[300px]` table with no mobile variant, producing a silent 21px scroll at 390 and pushing its `When` column outside its own card.
- **Why it matters**: Filtering is the only way to use a 5,311px stream, and the filter controls hide their own options.
- **Fix**: Add the fade mask + snap to the pill wrapper; give `RecentRequests` the same card-list treatment as `UsageTable`, or an explicit `overflow-x-auto` wrapper with a `sticky left-0` model column.
- **File**: `src/app/(dashboard)/dashboard/usage/components/RealtimeRequestsCard.js:189,233-238` · `src/shared/components/UsageStats.js:99-104`

#### [P2] 7,720px of single-column chrome; the three live panels stack redundantly
- **What**: At 390 the page is a 7,720px scroll in a 796px viewport: five 106px metric cards, 320px of provider topology, then a 5,311px unvirtualised 30-row stream at 177px per row. `ProviderTopology`, `RecentRequests` and `RealtimeRequestsCard` stack below 1024 because their grid is `lg:grid-cols-[...]`.
- **Why it matters**: One metric per screenful, and three panels that tell one story are three 300px+ blocks. Topology — the least actionable — takes the prime scroll position.
- **Fix**: Densify the mobile record card to two lines (~60px) with account/key behind a tap-opened sheet and a ~10-row cap with explicit `Load more`; collapse the three live panels into one segmented panel below 1024; make `OverviewCards` a 2-col micro-grid below 640 with the In/Cache/Out split behind a disclosure.
- **File**: `RealtimeRequestsCard.js:233-238` · `UsageStats.js:805-818` · `OverviewCards.js:53,95-110`

#### [P3] Period and sub-tabs scroll out of reach; identity columns scroll away
- **What**: The period selector sits in the header card that scrolls off at y≈350; the 760px/900px analytics tables scroll 300–590px at 360 with a non-sticky row identity.
- **Why it matters**: The most-used control is unreachable from the table it drives, and scrolled numbers lose their row labels.
- **Fix**: Hoist period + tab strip into one sticky bar below the Header; add a shared sticky-first-column rule for `.data-table` in `globals.css` and apply it to the analytics tables. `UsageTable` already wraps the group cell in `<th scope="row">` — only the sticky style is missing.
- **File**: `page.js:88-113` · `src/app/globals.css` · `TopProvidersCard.js:159` · `AnalyticsModelTable.js:63`

---

### Persona Red Flags

- **Mobile-first operator (phone at 360px)**: Cannot read any bucket value in the Volume Grid. Cannot see the `Request Logs` tab. Cannot see the `Failed` filter. Period changes are a mis-tap risk. Every — 7,720px deep.
- **Auditor on a tablet (768x1024)**: `overview` still shows 26 sub-44px targets and the same clipping; the breakdown table gains `overflow-x` (1.05x) with sortable 32px header buttons.
- **Screen-reader user**: `BlockGrid` announces only the peak value — the per-bucket data has no accessible text at all.

---

### Minor Observations

- `.tab-scroll-fade` is applied to the sub-tab strip but not the main tab strip — the mask exists, it is just not used where it is needed most.
- ~45 lines of `px-3 sm:px-3` in `UsageStats.js:545-641` are no-ops: the `sm:` prefix repeats the base value and does nothing.
- `ProviderTopology` clips 38px of canvas at 360 with no scroll path; `min-w-[130px]` nodes cannot show more than 2 at once.
- `Modal`'s `size` prop is width, not breakpoint (`max-w-sm/md/lg/xl`) — it is not responsive, and reads as if it were.
- No `dvh`/`svh` handling anywhere; the `h-screen` shell plus inner custom-scroller is the classic iOS pattern that fights the collapsing URL bar, and `sticky top-0` table headers stick to that moving edge.

---

### Questions to Consider

- Should the three live panels (topology, recents, stream) become one segmented panel below 1024, given they answer the same question at three time scales?
- Should `ProviderTopology` exist below 640 at all, or is a sorted provider list with a link to the topology the honest mobile answer?
- Should `BlockGrid` keep its block metaphor on phones, or become a ranked list of the top-N buckets — and which reading do operators actually need on a phone?

---

### Direction

**Hybrid: change containers below 640; do not fork the page.**

Pure reflow has hit its floor — the page's reflow vocabulary is two moves (`grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-5`, and the `sm:hidden` card list), and the second is applied to 4 of ~10 surfaces. `BlockGrid`'s `repeat(24, minmax(0,1fr))` is width-driven, not breakpoint-driven: 9px cells are the mathematically correct answer to the width it is given, so no class swap fixes it.

A dedicated mobile route would duplicate five stateful data-fetching components (`UsageStats` with SSE/abort/backoff, `UsageChart`, `RealtimeRequestsCard`, `UsageTable`, `AnalyticsTab`) and fork the parameterised `activeTableConfig` render-prop pattern the codebase already prefers — 1,000+ lines for no functional gain.

Ship the hybrid, with two structural moves: make the mobile branch a real component-level `compact` mode that renders **one** branch rather than hidden twins, and move period + tabs into a sticky bar. Reassess a fork only if a third surface needs a phone-only IA.

---

#### Run Notes
- Target slug: `src-app-dashboard-dashboard-usage-page-js`
- Ignore list: none
- Assessment independence: dual-agent parallel (`MobileAssessA` & `MobileAssessB`)
- Detector: `impeccable 4.0.0` — zero findings across all usage files, all scopes, and `src/`; no layout/responsive rules exist
- Browser: fresh tabs, device emulation (dsf 3, isMobile, hasTouch) at 360x640 / 390x844 / 768x1024 / 1280x800
- Screenshots: `assessB_{360,390,768}_overview.png`, `assessB_390_breakdown.png`, `assessB_{360,390}_blockgrid.png`, `assessB_{360,390}_analytics*.png`, `assessB_390_details.png`
