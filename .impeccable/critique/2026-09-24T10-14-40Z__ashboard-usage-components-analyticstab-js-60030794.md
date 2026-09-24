---
target: src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/workspaces/9router-X-ui/src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js"
target_fingerprint: "sha256:3f3f10a69d371b745f89ffb6b70492cc046732b726d1246b4687c3acd120c265"
target_path: /workspaces/9router-X-ui/src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js
timestamp: 2026-09-24T10-14-40Z
slug: ashboard-usage-components-analyticstab-js-60030794
---
# Assessment Report: 9router-X Usage Analytics Tab

**Target:** `src/app/(dashboard)/dashboard/usage/components/AnalyticsTab.js`
**Live URL:** `http://192.168.90.101:10128/dashboard/usage?tab=analytics`
**Method:** dual-agent (A: AnalyticsCritiqueA · B: deterministic-eval)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading spinner and "Last updated" present, but no section indicator for a 5,341px vertical page. |
| 2 | Match Between System and Real World | 3 | Metrics are clear, but technical percentiles (P50/P95) lack contextual tooltips. |
| 3 | User Control and Freedom | 3 | Filter chips dismissible; table sort reversible; but filter state lost across route transitions. |
| 4 | Consistency and Standards | 2 | Mixed controls: Combobox for Provider/Model vs raw `<select>` inside square boxes for Time Granularity and Auto Refresh. |
| 5 | Error Prevention | 3 | Input validation present; empty states handled; but no confirmation on filter clear-all. |
| 6 | Recognition Rather Than Recall | 2 | Color semantics implicit and shifting (amber = latency in Activity Grid, amber = output tokens in Waffle Grid). |
| 7 | Flexibility and Efficiency of Use | 1 | No keyboard shortcuts; no filter presets; 9-column table with no column toggles; duplicate failure tools. |
| 8 | Aesthetic and Minimalist Design | 1 | 12 vertical cards totalling 5,341px of scroll. Activity Grid is 529px tall for 1 metric; Top Providers is 905px tall. |
| 9 | Error Recovery | 3 | Retry button and failure inspection modal functional. |
| 10 | Help and Documentation | 2 | Header subtitle provides overview, but zero inline help on complex block/waffle charts. |
| **Total** | | **23/40** | **Acceptable — significant structural improvements needed** |

## Design Specificity Verdict

**Category-interchangeable.** The analytics tab is structured like a generic SaaS template rather than an operator-grade AI proxy gateway. The unbroken stack of 12 cards, stock block grids, and detached filter bar create a disjointed experience. Most crucially, the four core dimensions of AI router activity (Request Volume, Tokens, Failures, and Latency) are artificially separated behind tabs in a 529px card, destroying the operator's ability to cross-correlate failure spikes with traffic volume.

**Deterministic scan:** 0 CLI lint findings. Live viewport audit reveals 5,341px total desktop height, 529px Activity Grid, 341px Waffle Grids, 905px Top Providers card, and clunky filter bar controls.

## Overall Impression

The analytics tab provides extensive telemetry, but buries it under 5,300px+ of repetitive vertical cards. The single biggest design flaw is hiding three of four core activity metrics behind tabs in a 529px grid. Redesigning this to display all four activity streams simultaneously in compact, color-coded rows will unlock correlation and cut page height by over 40%.

## What's Working

1. **Waffle grids for proportion.** The Requests, Tokens, and Models waffle panels communicate volume breakdown clearly with intuitive 100-cell density.
2. **Interactive failure inspection.** Clicking failure counts in the model table opens a detailed response payload inspector modal with raw JSON and fallback retrieval.
3. **Failure intelligence workbench.** The dedicated FailureAnalyticsCard provides valuable investigative tooling once reached.

## Priority Issues

- **[P1] Activity Grid hides metric comparisons behind tabs**
  - **Why it matters:** An operator diagnosing an incident cannot see if a latency jump aligns with a failure spike or request surge without clicking between tabs.
  - **Fix:** Replace the tabbed single-metric view with a stacked multi-stream layout showing Requests, Tokens, Failures, and Latency simultaneously, each with distinct color and clear label.
  - **Suggested command:** `$impeccable layout`

- **[P1] Bloated card heights and excessive vertical scroll**
  - **Why it matters:** The page spans 5,341px across 12 distinct cards with no grouping or hierarchy. Activity Grid alone takes 529px; Top Providers takes 905px.
  - **Fix:** Slim block grid row heights down from 12 rows to 5-6 rows; group sections into 3 cohesive zones (Overview & Streams, Failures & Breakdown, Deep Dive Table).
  - **Suggested command:** `$impeccable quieter`

- **[P2] Clunky filter bar UI with raw select elements**
  - **Why it matters:** Time Granularity and Auto Refresh use unstyled native `<select>` tags inside fixed square boxes (`size-11 sm:size-8`), clashing with Combobox inputs.
  - **Fix:** Restyle Granularity and Auto Refresh into clean dropdowns or compact segmented chips matching the house design language.
  - **Suggested command:** `$impeccable polish`

- **[P2] Unnecessary CSV export button creates visual clutter**
  - **Why it matters:** Infrequent export action sits in the primary filter bar alongside live operational controls.
  - **Fix:** Remove the CSV button from the filter bar completely.
  - **Suggested command:** `$impeccable distill`

- **[P3] Redundant Drilldowns section duplicates existing visualizations**
  - **Why it matters:** Three separate block grids at the bottom of the page duplicate what the Activity Grid and Model Table already communicate.
  - **Fix:** Remove or collapse the redundant Drilldowns section once the unified multi-stream Activity Grid is active.
  - **Suggested command:** `$impeccable distill`

## Persona Red Flags

- **Alex (Power User / SRE):** Cannot cross-reference traffic and errors at a glance due to the tab switcher. Must scroll past 3,000px of cards to reach the full model performance table.
- **Jordan (First-Time Operator):** Overwhelmed by 12 cards on initial load. "Activity Grid" tab gives no cue that other metrics exist underneath until clicked.
- **Sam (Accessibility):** Multiple nested scrolling regions and screen-reader unannounced auto-refresh indicator.

## Minor Observations

- Time granularity and auto-refresh dropdowns have inconsistent mobile hit states.
- Duplicate failure modals maintained in both parent page and FailureAnalyticsCard.
- Model performance table has 9 columns without horizontal visibility presets.

## Questions to Consider

1. Should the four activity streams (Requests, Tokens, Failures, Latency) be displayed as stacked horizontal stream bars or a compact 2x2 grid?
2. Should redundant bottom drilldown charts be removed to bring the Model Performance Table higher up the page?
3. What is the preferred control style for time granularity and auto-refresh in the filter bar?
