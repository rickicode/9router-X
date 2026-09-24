---
target: src/app/(dashboard)/dashboard
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/workspaces/axonrouter-X/src/app/(dashboard)/dashboard"
timestamp: 2026-09-14T14-20-39Z
slug: src-app-dashboard-dashboard
---
# Critique Report: axonrouter-X Dashboard (Run 2 - Post Distill/Harden/Polish)

## Design Health Score: 28/40 (Good)

- 1. Visibility of System Status: 3
- 2. Match System / Real World: 4
- 3. User Control and Freedom: 3
- 4. Consistency and Standards: 3
- 5. Error Prevention: 3
- 6. Recognition Rather Than Recall: 3
- 7. Flexibility and Efficiency: 2
- 8. Aesthetic and Minimalist Design: 3
- 9. Error Recovery: 2
- 10. Help and Documentation: 2

## Priority Issues
- [P1] Healthy-poll stops polling, stale ONLINE risk in useTunnelStatus.js
- [P1] Silent auto-provision "Default Key" on empty list in EndpointPageClient.js
- [P1] Tooltip keyboard/touch inaccessible in Tooltip.js
- [P2] Empty-URL guard missing renders bare "/v1"
- [P2] Tailscale auth fallback loses dashboard state (window.location.href)
- [P2] Duplicate tunnel URL + BENEFITS drift in TunnelCard.js
