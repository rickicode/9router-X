---
target: src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/workspaces/9router-X-ui/src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js"
target_fingerprint: "sha256:bc2c2cfd0da65bdcab08523657dea792dcc9eb20c631cf4431cee57165f5b16f"
target_path: /workspaces/9router-X-ui/src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js
timestamp: 2026-09-24T11-35-00Z
slug: dashboard-console-log-critique
---
# Assessment Report: AxonRouter Live Console Log

**Target:** `src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js`  
**Live URL:** `http://192.168.90.101:10128/dashboard/console-log`  
**Method:** dual-agent (Heuristic Specialist · Runtime Evidence from operator console)

---

## 1. Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | **1** | `connected` state tracked but never rendered — operator cannot tell Live vs Paused vs Reconnecting. |
| 2 | Match System / Real World | **3** | Raw monospace log lines match operator expectations; ANSI codes stripped server-side. |
| 3 | User Control and Freedom | **3** | Pause/Resume + Clear present; Clear relies on SSE round-trip with no local fallback. |
| 4 | Consistency and Standards | **2** | Hardcoded `bg-black` ignores dark/light theme tokens used everywhere else. |
| 5 | Error Prevention | **2** | `JSON.parse(e.data)` unguarded — one malformed SSE frame kills the stream handler. |
| 6 | Recognition Rather Than Recall | **2** | No line count, no error/warning tally, no filter — operator must eyeball hundreds of lines. |
| 7 | Flexibility and Efficiency of Use | **2** | No search/filter, no keyboard shortcuts, auto-scroll yanks viewport even while reading history. |
| 8 | Aesthetic and Minimalist Design | **3** | Compact toolbar and full-height log pane are appropriately lean. |
| 9 | Error Recovery | **1** | `es.onerror` only flips a dead flag; no reconnect feedback, no manual retry affordance. |
| 10 | Help and Documentation | **3** | Purpose self-evident for a debug console; toolbar labels are clear. |
| **Total** | | **24/40** | **Needs Work — functional but blind and brittle** |

---

## 2. Runtime Evidence (Operator Console)

### [P0] SSE endpoint 404 — page completely broken
```
GET http://192.168.90.101:10128/api/translator/console-logs/stream → 404
```
- **Why it matters:** Commit `ae7499c` deleted `src/app/api/translator/console-logs/*` during MITM/translator cleanup, but the client still pointed at the removed route. The page rendered an empty black pane forever — no live logs, no clear functionality.
- **Fix applied:** Restored handlers as canonical routes `src/app/api/console-logs/route.js` (GET/DELETE) and `src/app/api/console-logs/stream/route.js` (SSE with init/line/lines/clear events, 25s keepalive, abort cleanup), plus backward-compatible re-exports at the legacy `/api/translator/console-logs*` paths. Client repointed to `/api/console-logs`.

### [P0] React hydration error #418 on page load
```
Uncaught Error: Minified React error #418 (Hydration failed: text content mismatch)
```
- **Why it matters:** Server-rendered markup diverged from client render, forcing React to discard SSR output — combined with the 404, the page was in a broken state on load.
- **Fix applied:** `page.js` now loads the client via `dynamic(..., { ssr: false })` with a `CardSkeleton` fallback — this page is inherently client-streaming content, so SSR adds nothing.

---

## 3. Priority Issues (Design-Level)

### [P1] Connection state invisible
- **Why it matters:** `connected` state existed in code but was never displayed. An operator staring at a frozen log pane cannot distinguish "no new logs" from "stream died".
- **Fix applied:** Status chip with pulsing dot — `Live` (green) / `Paused` (amber) / `Reconnecting…` (red), `role="status"` + `aria-live="polite"`.

### [P1] No filtering or search on a 200-line buffer
- **Why it matters:** `CONSOLE_LOG_CONFIG.maxLines = 200` raw lines with zero affordance to isolate `ERROR` lines during an incident.
- **Fix applied:** Filter input (`/` focuses, `Escape` clears), live match count, and ERROR/WARN tally badges computed from line content.

### [P2] Auto-scroll fights the reader
- **Why it matters:** Every new line yanks `scrollTop` to bottom — impossible to scroll up and read a stack trace while logs keep flowing.
- **Fix applied:** Track-at-bottom heuristic (60px threshold); scrolling up pauses auto-scroll, returning to bottom resumes it.

### [P2] Level coloring fragile
- **Why it matters:** Regex `match[1]` assumed the first bracketed tag was a level; lines like `[pool-1]` fell through to default green, hiding real WARN/ERROR lines.
- **Fix applied:** Case-normalized tag lookup with keyword fallback (`error|fail|exception` → red, `warn|deprecat` → amber, `debug|trace` → primary, `info|ready|started` → info).

---

## 4. Fixes Applied in This Pass

1. Restored `/api/console-logs` + `/api/console-logs/stream` (SSE) with legacy `/api/translator/console-logs*` aliases → 404 eliminated.
2. `ssr: false` dynamic import → hydration #418 eliminated.
3. `JSON.parse` guarded per-message; a malformed frame now logs instead of killing the handler.
4. Live/Paused/Reconnecting status chip with aria-live.
5. Filter input + keyboard shortcuts (`/`, `Escape`) + line/error/warn counters.
6. Smart auto-scroll that yields to the reader.
7. Robust level coloring with keyword fallback; `whitespace-pre-wrap break-words` for long stack traces.
8. Mobile touch floors on Pause/Clear (`min-h-9 sm:min-h-7`).

## 5. Remaining Recommendations

- **[P3]** Replace hardcoded `bg-black` with theme token (e.g. `bg-[#0a0a0a] dark:bg-black`) so light mode isn't a jarring void.
- **[P3]** Add "Download log" button backed by the rotating file at `${DATA_DIR}/logs/console.log` for post-mortem sharing.
- **[P3]** Jump-to-bottom FAB when scrolled away with new lines arriving.

**Verdict:** Page went from fully broken (404 + hydration crash) to functional with operator-grade affordances. Score re-audit after deploy should land ~33/40.
