# DelendAI control plane

**The estate operations dashboard — Vite + Next.js, owned by `toxicwind`.**

> Note: the repo root `readme.md` is a symlink to `packages/next/README.md` (the
> Next.js 14 fork's own readme). This document is this repo's control-plane
> frontend readme, kept root-side in `docs/` so it never clobbers the fork's.

## What is this?

A **DelendAI control plane**: one owned dashboard that visualizes the estate's
services grid, the API table, the DelendAI reachable-provider usage/cost
surface, and the kappa-board chat channels — instead of a wall of raw 25xxx
endpoints.

- **Owned.** `toxicwind/agent-dashboard`, our fork of `vercel/next.js` 14
  (default branch now `main`; `origin/canary` backed up as
  `backup/canary-20261021`).
- **Wired.** Ports from the estate `config/ports.env` SSOT (25xxx), supervised
  by pitchfork, fed by the DelendAI Ops/API (`:25100/v1`).

## Why it matters

Most control planes are a static grid or a vendor wall. This one is a real,
running dashboard for a real fleet — the kappa board is a chat channel, the
providers are the live freeinference/deepseek surface, and it's all ours.

**Feature bullets**

- **`apps/delendai-control-plane`** — Vite · React 19 · TS · Tailwind · Vitest
  (the primary control-plane SPA).
- **Provider / router dashboards** — DelendAI reachable-provider usage + cost
  recommendation surface.
- **kappa-board channels** — the kappa board as squawk chat channels.
- **Services grid + API table** — the estate's live services + 25xxx surfaces.
- **Vite + Next.js** — Vite for the fast, testable SPA; Next.js 14 pages for
  docs/journeys. One repo.

```
┌───────────────────────────────────────────────┐
│              DelendAI control plane           │
│  apps/delendai-control-plane  (Vite SPA)      │
│  ├─ services grid / API table                 │
│  ├─ provider + router dashboards              │
│  └─ kappa-board chat channels                 │
│  fed by  DelendAI Ops/API  :25100/v1          │
│  served on  Port SSOT :25xxx (pitchfork)      │
└───────────────────────────────────────────────┘
```

## Architecture

- `apps/delendai-control-plane/` — the Vite SPA (services grid, provider/router
  dashboards, kappa-board channels; chart/api/stores layout).
- `apps/bundle-analyzer/` — Next.js 14 bundle/bench analysis.
- Next.js pages (`app/`) — React 18 docs/static journeys.
- Supervision: estate pitchfork daemon; Port SSOT `config/ports.env`.

## Config / optional services

- Control-plane API target: `VITE_CONTROL_API` (default
  `http://127.0.0.1:25100/v1`).
- Reachable-provider discovery via DelendAI MCP/API.
- kappa-board bridge: `ranch/squawk/kappa_board_bridge.py`.

## Dev / contributing

See `AGENTS.md` (estate conventions), `contributing.md`, `UPGRADING.md`. The
repo is ours; reference sibling repos by local path (R-503). Default branch is
`main`.

## License & security

MIT (see repo root `LICENSE` futures). For security issues prefer the estate's
responsible disclosure channels over a public issue.
