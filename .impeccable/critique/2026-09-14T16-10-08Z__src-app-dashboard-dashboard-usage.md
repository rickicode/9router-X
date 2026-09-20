---
target: src/app/(dashboard)/dashboard/usage
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/workspaces/9router-X/src/app/(dashboard)/dashboard/usage"
timestamp: 2026-09-14T16-10-08Z
slug: src-app-dashboard-dashboard-usage
---
# Critique Report: 9router-X Usage Dashboard (Run 1 - master a768cd5b)

## Design Health Score: 17/40 (Poor)

- 1. Visibility of System Status: 2
- 2. Match System / Real World: 2
- 3. User Control and Freedom: 3
- 4. Consistency and Standards: 1
- 5. Error Prevention: 1
- 6. Recognition Rather Than Recall: 1
- 7. Flexibility and Efficiency: 2
- 8. Aesthetic and Minimalist Design: 2
- 9. Error Recovery: 2
- 10. Help and Documentation: 1

## Priority Issues
- [P0] Exact-ID text filters in AnalyticsTab (Provider exact ID, Model exact ID)
- [P1] Overview information overload (6-7 blocks + 6 fetches + SSE vertical)
- [P1] Mobile failure + hidden navigation (no-scrollbar, min-w 860/980, 1s TimeAgo drain)
- [P2] Silent failures + unsafe CSV export (generic catch, data:text/csv truncate)
- [P2] Bilingual + a11y gaps (mixed ID/EN, no label, opacity 0 icons, no scope/aria-sort)
