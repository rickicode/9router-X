# Dashboard redesign

Source of truth for the console. Landing (`src/app/landing`, `#f97815`) stays separate.

## Look

Old console is warm coral `#E56A4A` on cream `#FDFAF6`, dark `#1a1a1a`, radius 10–14px, macOS traffic lights, blur sidebar.

New console is cool slate with one cyan accent:

| Token | Light | Dark |
|---|---|---|
| brand / primary | `#0891B2` | `#22D3EE` |
| bg | `#F4F7F8` | `#0B1220` |
| surface | `#FFFFFF` | `#121A2B` |
| sidebar | `#E7EEEF` | `#0E1728` |
| border | `#D5DEE2` | `#243044` |
| text | `#0F172A` | `#E6EDF3` |
| radius | 2px on every control | 2px |

No coral, no cream, no traffic-light dots, no blur glass sidebar.

## Scope

1. `src/app/globals.css` tokens. Every page using `bg-surface`, `border-border`, `text-text-main`, `bg-primary` follows.
2. Shell: `Sidebar.js`, `Header.js`, `DashboardLayout.js`.
3. Controls: `Button`, `Card`, `Input`, `Select`, `Combobox`, `Modal`, `Drawer`, `SegmentedControl`. Radius `rounded-md` only.
4. Then each dashboard `page.js`. Strip leftover `bg-white`, raw hex, and `rounded-[Npx]`.
5. Copy stays English source keys through `translate()`. `id.json` gets real Indonesian. Other locales keep the English key until a real translation exists.

## Pages to check

`dashboard`, `endpoint`, `providers`, `providers/new`, `providers/[id]`, `combos`, `usage`, `benchmark`, `quota`, `token-saver`, `proxy-fitness`, `cli-tools`, `cli-tools/[toolId]`, `console-log`, `translator`, `proxy-pools`, `skills`, `profile`, `mitm`, `pxpipe`, `media-providers` kind, id, web, combo, `basic-chat`.

## Out

No API, route, or logic changes. No landing restyle. No commit until asked.

## Done when

- `globals.css` has no `#E56A4A` or `#FDFAF6`.
- Sidebar has no `#FF5F56`.
- Dashboard and shared UI have no `rounded-[10px]`, `rounded-[14px]`, or `bg-[#FF5F56]`.
- Logger test `tests/unit/usage-sse-backoff-logger-json.test.mjs` still passes.
