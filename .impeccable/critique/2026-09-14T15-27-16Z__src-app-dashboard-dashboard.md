---
target: src/app/(dashboard)/dashboard
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/workspaces/axonrouter-X/src/app/(dashboard)/dashboard"
timestamp: 2026-09-14T15-27-16Z
slug: src-app-dashboard-dashboard
---
# Critique Report: axonrouter-X Dashboard (Run 3 - Post Batch2, master a768cd5b)

## Design Health Score: 34/40 (Good)

- 1. Visibility of System Status: 3
- 2. Match System / Real World: 3
- 3. User Control and Freedom: 3
- 4. Consistency and Standards: 3
- 5. Error Prevention: 3
- 6. Recognition Rather Than Recall: 3
- 7. Flexibility and Efficiency: 2
- 8. Aesthetic and Minimalist Design: 3
- 9. Error Recovery: 3
- 10. Help and Documentation: 2

## Priority Issues
- [P1] copy URL mismatch Tailscale (EndpointUrlsCard.js:134, TailscaleCard.js:273 ignores publicUrl fallback)
- [P1] no loading lock on ApiKeys actions (Toggle/delete/create race)
- [P2] dual Tooltip maintenance drift (endpoint vs shared variants)
- [P2] stale success status never auto-clears in useTunnelStatus.js
- [P3] DashboardLayout overlay semantics contradictory (role=button + tabIndex=-1 + aria-hidden)
- [P3] globals.css brand duplication (:root vs .dark identical 9 tokens)
