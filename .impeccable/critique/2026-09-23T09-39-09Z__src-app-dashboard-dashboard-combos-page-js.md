---
target: src/app/(dashboard)/dashboard/combos/page.js
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/workspaces/9router-X-ui/src/app/(dashboard)/dashboard/combos/page.js"
target_fingerprint: "sha256:0eacf3169b5fd882da19364940ef7dc2fc62a0d340467e3f514240ee7626c785"
target_path: /workspaces/9router-X-ui/src/app/(dashboard)/dashboard/combos/page.js
timestamp: 2026-09-23T09-39-09Z
slug: src-app-dashboard-dashboard-combos-page-js
---
# Critique: AI Routing Gateway — Model Combos, Smart Routing, Capacity Adapters & Analytics

Method: dual-agent (A: CritiqueAssessA · B: CritiqueAssessB)

**Target**: `src/app/(dashboard)/dashboard/combos/page.js`  
**Live URL**: `http://192.168.90.101:10128/dashboard/combos`

---

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Fire-and-forget strategy and adapter mutations; silent catch blocks with zero feedback on network failure. |
| 2 | Match System / Real World | 1 | Severe language mixing (Indonesian phrases inside English UI); cryptic jargon (`"Round"`, `"conf 0.00"`, `"N+1 calls"`). |
| 3 | User Control and Freedom | 2 | Hand-rolled Tier Modal ignores `Escape` key and lacks focus trapping; modal-on-modal stacking risks losing draft state. |
| 4 | Consistency and Standards | 2 | Shared `<Modal>` bypassed in favor of raw `div` modals with hardcoded `h-8` heights causing text collisions; mixed drag-handle icon implementations. |
| 5 | Error Prevention | 2 | Deleting last capacity adapter model silently falls back to default without notice; sticky calls input lacks boundary validation. |
| 6 | Recognition Rather Than Recall | 2 | Strategy dropdown text truncates in fixed 220px box; tier models hidden behind modals rather than previewed on the card. |
| 7 | Flexibility and Efficiency | 2 | No keyboard accelerators; reordering and deleting models in Capacity Adapter impossible on touch devices due to hover-only controls. |
| 8 | Aesthetic and Minimalist Design | 2 | Header bullet dump creates visual noise; hardcoded `h-8` in tier modal causes subtitle and inputs to overlap; cramped padding in 29 DOM locations. |
| 9 | Error Recovery | 2 | Network errors on strategy/adapter toggles fail silently without toast notifications or retry paths. |
| 10 | Help and Documentation | 2 | Wall-of-text bullets in header; references unexplained external constructs ("Morph Matrix") without tooltips or links. |
| **Total** | | **19/40** | **Poor (Major UX overhaul required)** |

---

### Design Specificity Verdict

**Verdict**: Generic Admin Shell with High Domain Depth, Marred by Incomplete Authoring and Localization Glitches.

The backend domain concepts (multi-tiered prompt difficulty routing, input modality fallbacks for vision/audio, parallel panel fusion) are sophisticated. However, the frontend presentation alternates between an off-the-shelf dark-mode admin template and an unfinished developer workbench:
- **Linguistic Discontinuity**: An English-first production interface abruptly lapses into hardcoded Indonesian phrases in the Smart Routing module (`"Mengklasifikasikan kompleksitas task"`, `"Model Pertama Combo"`, `"Pilih & Urutkan"`, `"Batal"`, `"Oke, Terapkan Urutan"`).
- **Structural Boilerplate**: The page header leads with an unstyled 4-bullet explanatory block that consumes prime screen real estate instead of integrating progressive disclosure or contextual onboarding.
- **Nested Modal Pattern**: Creating a combo and choosing models triggers stacked modal overlays (Modal on top of Modal) with overwhelming provider pill walls.
- **Truncated & Cryptic Copy**: Critical toggles and labels are truncated or ungrammatical (`"Round"` instead of `"Round Robin"`, select options cut off inside fixed-width containers).

**Deterministic Scan Findings**:
- CLI scan on `page.js` and `components/`: 0 static syntax rule violations.
- In-browser runtime injection (`detect.js`): 208 total rule messages. Primary physical defects: 29 `cramped-padding` warnings, 12 `undersized-ui-text` (<11px), 9 `tiny-text`, 4 `nested-cards`, 1 `clipped-overflow-container`, 4 `text-occlusion` on custom select arrows (evaluated as false positives), and 144 `ai-color-palette` flags (cyan/teal dark palette misclassified).

---

### Overall Impression

The page possesses solid core technical capabilities (rich analytics, model capacity badges, 3-tier routing), but suffers from architectural sprawl and severe UI defects. Forcing combo management, smart routing tier inspection, and modality adapters into a single 4,000px vertical scroll without progressive disclosure makes the interface feel overwhelming and fragile.

---

### What's Working

1. **Capacity Badges**: Instant visual identification of model capabilities (Vision, Reasoning, Web Search) through concise, color-coded icons with rich descriptive tooltips.
2. **Analytics Diagnostic Depth**: The Analytics tab excels at highlighting system health, surfacing the "Weakest member" with exact failure counts, upstream error reasons, and tier leaderboards.
3. **Preset Protection**: Clear visual and functional segregation between customizable user combos and immutable built-in system presets.

---

### Priority Issues (P0–P3)

#### [P1] Broken Layout & Localization Collision in Smart Routing Tier Modal
- **What**: The modal opened via "Pilih & Urutkan" has hardcoded `h-8` (32px) heights on header and toolbar rows, causing the two-line subtitle and input field to render directly on top of each other. Furthermore, all copy inside this modal and its parent section is hardcoded in Indonesian.
- **Why it matters**: Severe visual bug destroys readability, appears broken to users, and breaks language consistency in an enterprise tool.
- **Fix**: Remove fixed `h-8` heights in `SmartRoutingSection.js`; use flex auto heights with standard padding; translate all strings to English (`"Pilih & Urutkan"` -> `"Configure Tier"`, `"Oke, Terapkan Urutan"` -> `"Apply Order"`, `"Batal"` -> `"Cancel"`); adopt the shared `<Modal>` component with proper Escape key dismiss.
- **Suggested command**: `$impeccable clarify`

#### [P1] Hover-Only Controls & Card Overflow in Capacity Adapter
- **What**: Reorder and delete buttons on model chips inside `CapacityAdapterCap` use `opacity-0 group-hover/chip:opacity-100`. On touch devices, hover does not exist, leaving fallback models impossible to reorder or delete. On mobile viewports (<400px), long model chips overflow past the card boundary.
- **Why it matters**: Breaks core functionality for mobile/tablet users; violates touch accessibility guidelines.
- **Fix**: Replace hover-only buttons with always-visible touch targets or an explicit edit mode; set `max-w-full truncate` on model chip containers; fix label from `"Round"` to `"Round Robin"`.
- **Suggested command**: `$impeccable adapt`

#### [P1] Header Wall of Text & High Cognitive Load Architecture
- **What**: An unformatted 4-item bullet list explaining Fallback, Round Robin, Smart Routing, and Fusion is hardcoded directly into the page header, taking up 200px+ of viewport before the combos list.
- **Why it matters**: Clutters the top of the interface, pushes actionable items below the fold, and forces repeat users to read onboarding copy on every visit.
- **Fix**: Remove the header bullet list; integrate strategy descriptions as contextual help icons next to the strategy dropdown; elevate Capacity Adapter into a distinct third sub-tab (`Combos` | `Modality Adapters` | `Analytics`) in the top `SegmentedControl`.
- **Suggested command**: `$impeccable distill`

#### [P2] Silent Async Mutations and Error Swallowing
- **What**: `handleSetComboStrategy`, `handleSetCapacityAdapter`, and `handleDelete` contain empty `catch (error) {}` blocks and perform PATCH requests without saving indicators or error toasts.
- **Why it matters**: If network requests fail or session expires, users are left in an unsynchronized state without awareness or recovery steps.
- **Fix**: Add loading spinners on mutation triggers and surface errors via `notify.error(err.message || "Failed to save strategy")`.
- **Suggested command**: `$impeccable harden`

---

### Persona Red Flags

- **Alex (Impatient Power User)**:
  - No keyboard shortcuts (`/` for search, `C` for Create Combo, `Esc` to close tier modal).
  - Multi-step modal drill-down required to adjust tier models (3 clicks per tier across separate modals).
  - No batch selection or YAML/JSON import/export for combo configurations.
- **Jordan (Confused First-Timer)**:
  - Baffled by abrupt language switches (`"Mengklasifikasikan kompleksitas task"`, `"Batal"`).
  - Disoriented by domain jargon without clear analogies (`"Morph Matrix"`, `"Sticky calls/model"`, `"Round"`).
  - Confused by the section title `"Vision Adapter"` which also controls Audio input.
- **Sam (Accessibility-Dependent User)**:
  - Smart Routing tier modal lacks `role="dialog"`, `aria-modal="true"`, and focus trapping; pressing `Escape` fails to dismiss it.
  - Reorder and delete controls on capacity adapter chips are completely hidden (`opacity-0`) and lack accessible focus indicators.
  - Text overlapping in the tier modal causes unreadable visual collisions for users with screen magnifiers.

---

### Minor Observations

- The strategy `<Select>` dropdown is constrained to `sm:w-[220px]`, causing options like `"Smart Routing — difficulty judge (easy/med/hard)"` to truncate abruptly.
- In the Analytics tab, the Model table lists `#2 judge-router` as a model when it is actually a combo name, indicating circular telemetry naming.
- Truncated error messages in Analytics (`"Weakest member: glm-5.3-flash (355 errors — No usable..."`) lack a tooltip or click-to-expand option to inspect the full trace.
- The `searchQuery` input uses native styling that diverges slightly from the shared `<Input>` component.

---

### Questions to Consider

- What if **Capacity Adapters** (Vision/Audio fallbacks) were promoted to their own dedicated tab alongside **Combos** and **Analytics**, reducing page scroll height and giving modalities first-class visibility?
- What if strategy configuration lived inside a dedicated drawer/sheet rather than exposing complex nested controls directly inside each collapsed card?
- Could a "Test Route" sandbox button allow operators to simulate a prompt and preview which model would be chosen before committing changes to production?
