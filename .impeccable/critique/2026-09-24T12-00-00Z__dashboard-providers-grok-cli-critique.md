---
target: src/app/(dashboard)/dashboard/providers/[id]/page.js (provider: grok-cli)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
p2_count: 3
target_identity: "file:/workspaces/axonrouter-X-ui/src/app/(dashboard)/dashboard/providers/[id]/page.js?provider=grok-cli"
target_fingerprint: "sha256:b713cd407039a31550dd9a3c31ab698e556e7666d6c105d352d3e879cfcec735"
target_path: /workspaces/axonrouter-X-ui/src/app/(dashboard)/dashboard/providers/[id]/page.js
timestamp: 2026-09-24T12-00-00Z
slug: dashboard-providers-grok-cli-critique
---
# Assessment Report: axonrouter-X Provider Detail — Grok CLI (Grok Build)

**Target:** `http://192.168.90.101:10128/dashboard/providers/grok-cli`  
**Components Evaluated:**  
- `src/app/(dashboard)/dashboard/providers/[id]/page.js`  
- `src/app/(dashboard)/dashboard/providers/[id]/ProviderHeader.js`  
- `src/app/(dashboard)/dashboard/providers/[id]/ConnectionsSection.js`  
- `src/app/(dashboard)/dashboard/providers/[id]/ModelsSection.js`  
- `src/app/(dashboard)/dashboard/providers/[id]/BulkImportGrokCliModal.js`  
- `src/shared/components/OAuthModal.js` (Grok CLI device-code flow)  
**Method:** dual-agent (Heuristic Specialist · Protocol / Domain Architecture Review)

---

## 1. Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | **3** | Single connection test and batch testing provide clear feedback; rolling 24h cooldown timer lacks exact remaining minutes in list view. |
| 2 | Match System / Real World | **3** | Plain explanation of device code login vs bulk token import; thinking levels match upstream spec (`low`, `medium`, `high`, `xhigh`). |
| 3 | User Control and Freedom | **3** | Good connection selection, batch delete, per-model toggle, and round-robin toggle. |
| 4 | Consistency and Standards | **3** | Adheres to provider detail layout (`ProviderHeader`, `ConnectionsSection`, `ModelsSection`). |
| 5 | Error Prevention | **3** | Delete connection and bulk-reset-status protected by `ConfirmModal`; JSON parse handles dirty input. |
| 6 | Recognition Rather Than Recall | **3** | Clear JSON placeholder with exact token fields; models section shows exact alias prefix `gcli/...`. |
| 7 | Flexibility and Efficiency | **3** | Dual connection methods: interactive **OAuth Device Code** + **Bulk Add** file drop for multi-account operators. |
| 8 | Aesthetic and Minimalist Design | **3** | Clean separation of credentials and model routing catalog; avoided card sprawl. |
| 9 | Error Recovery | **3** | Detailed per-item failure reporting during bulk import; connection test displays raw upstream error. |
| 10 | Help and Documentation | **3** | Upstream notice card links to SuperGrok subscription; clear hint for device authorization. |
| **Total** | | **30/40** | **Good — High-utility operator workbench with targeted polish needs** |

---

## 2. Design Specificity Verdict

**Authored specifically for Grok Build / xAI device code architecture.**
- Handles the unique device-code flow of `cli-chat-proxy.grok.com` where tokens are issued via `auth.x.ai` device authorization.
- Provides a dedicated **Bulk Add** modal allowing operators to paste arrays of `{ access_token, refresh_token, id_token, email }` or drag-and-drop multiple JSON files.
- Automatically captures the 24-hour rolling rate-limit cooldown (*"used all the included free usage"*), preventing upstream account bans through fair-share rotation.
- Accurately identifies `xhigh` as the default thinking mode for Grok 3 / Grok 3 Mini models.

---

## 3. What's Working

1. **Dual Import Pipelines:** Operators can authenticate a single account via browser device code or ingest dozens of accounts via JSON drop.
2. **Resilient JSON Parser:** `parseAccountsInput` accepts raw arrays, wrapped `{ accounts: [...] }`, or unbracketed comma-concatenated JSON objects.
3. **Model Alias Previews:** Model rows display the full alias (e.g. `gcli/grok-3`, `gcli/grok-3-mini`) with 1-click clipboard copy.
4. **Interactive Testing Workbench:** Test all accounts sequentially or individually with immediate response latency telemetry.

---

## 4. Priority Opportunities

### [P1] Touch Target Floor on Connections Empty State (`size="sm"`)
- In `ConnectionsSection.js` (lines 239–241), the `Bulk Add` button in the empty state uses standard padding which can sit below 40px on mobile screens. Add touch-floor classes (`min-h-9 sm:min-h-7`).

### [P1] Rolling 24-Hour Quota Indicator Clarity
- When Grok CLI returns a rolling-window 429 error, the account enters a cooldown. While `CooldownTimer` renders when active, displaying a badge `Rolling 24h Cap` clarifies why the account is temporarily skipped.

### [P2] Thinking Mode Dropdown Styling
- In `ModelsSection.js` (lines 228–237), the Thinking Level selector uses a native unstyled `<select>`. Aligning it with `SegmentedControl` or styled custom dropdown will improve visual polish.

### [P2] Bulk Add Modal Success Auto-Close / Feedback
- When importing 10+ accounts successfully, `BulkImportGrokCliModal` keeps the modal open until the operator clicks Close. Providing an auto-closing timer or clear success badge before exit improves throughput.

---

## 5. Persona Red Flags

- **DevOps Operator with 20 Grok accounts:** Wants to drag and drop multiple token exports at once. The bulk modal works well, but lacks a search filter within the modal's error report if 2 out of 20 accounts fail.
- **Developer using Claude Code via Grok proxy:** Directly copies `gcli/grok-3-mini` with default `xhigh` thinking effort; experience is smooth and immediate.

---

## 6. Minor Observations

- The provider header icon cleanly renders `auto_awesome` with color `#1DA1F2`.
- Notice banner correctly directs users to `https://grok.com/supergrok` for credit refills.
