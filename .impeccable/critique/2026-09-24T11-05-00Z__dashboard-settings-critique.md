---
target: src/app/(dashboard)/dashboard/settings/page.js
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
p2_count: 2
target_identity: "file:/workspaces/9router-X-ui/src/app/(dashboard)/dashboard/settings/page.js"
target_fingerprint: "sha256:653ce2ea95da7d9750cac6682b7f12c645d59ee96a158843089872c816c3e2b4"
target_path: /workspaces/9router-X-ui/src/app/(dashboard)/dashboard/settings/page.js
timestamp: 2026-09-24T11-05-00Z
slug: dashboard-settings-critique
---
# Assessment Report: AxonRouter Settings & Preferences

**Target:** `src/app/(dashboard)/dashboard/settings/page.js`  
**Live URL:** `http://192.168.90.101:10128/dashboard/settings`  
**Method:** dual-agent (Heuristic Specialist · Deterministic Codebase Audit)

---

## 1. Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | **3** | Memory stats and settings save states clear, but backup download lacks progress indicator on large DBs. |
| 2 | Match System / Real World | **3** | Plain explanation of UI auth vs model API keys, clear security warnings for remote access. |
| 3 | User Control and Freedom | **3** | Reversible toggles, confirmation modals for password reset and restore backup. |
| 4 | Consistency and Standards | **4** | Card sections, toggles, and modals adhere strictly to design system tokens. |
| 5 | Error Prevention | **3** | Destructive actions (reset password, database wipe/restore) protected by `ConfirmModal`. |
| 6 | Recognition Rather Than Recall | **3** | Theme toggle with visual icons (light/dark/system), flags for language selection. |
| 7 | Flexibility and Efficiency | **3** | One-click JSON backup download and file-drop restore. |
| 8 | Aesthetic and Minimalist Design | **3** | Clean division: Appearance, Security & Auth, Backup & Migration, System Memory. |
| 9 | Error Recovery | **3** | Error toasts on failed PATCH requests, safe fallback when password validation fails. |
| 10 | Help and Documentation | **3** | Explicit inline documentation explaining why API key and UI password are decoupled. |
| **Total** | | **31/40** | **Good — Stable, high-clarity settings configuration** |

---

## 2. Design Specificity Verdict

**Authored specifically for AI gateway operators.**
- Clear mental model separating **Dashboard Web UI Access** (password/session) from **LLM Model API Keys** (`/v1/*`).
- Specialized controls for PostgreSQL database backup/restore with bi-directional SQLite compatibility.
- Memory speed-layer inspection exposing active Valkey/Redis/in-memory footprint.

---

## 3. What's Working

1. **Explicit Security Decoupling:** The card clearly states: *"Protects dashboard web UI. Does not affect model API key verification."* preventing operator lockout confusion.
2. **Standardized Theme & Localization:** Theme switcher (Light, Dark, System) and Language Switcher integrated with immediate client preview.
3. **Safe Backup Handling:** Confirmation modal required before restoring backup JSON to protect existing PostgreSQL state.

---

## 4. Priority Opportunities

### [P1] Mobile Form Input Touch Floors
- Ensure password update input fields maintain `min-h-11` on mobile breakpoints to avoid accidental defocusing.

### [P1] Backup File Validation Feedback
- Display immediate file size and schema check feedback before triggering the full restore pipeline.

---

## 5. Minor Observations

- Route migration from `/dashboard/profile` to `/dashboard/settings` operates with zero broken links via 307 server redirect.
- Sidebar reflects accurate version badge (`v0.1.2`) alongside the GitHub link.
