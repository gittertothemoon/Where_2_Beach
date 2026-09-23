# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev              # Vite dev server, frontend only (port 5173)
npm run landing:dev      # Landing + app + API proxy (port 3000) — primary dev mode
npm run mobile:ios       # Start Expo iOS simulator (auto-starts web + API if needed)
```

### Build & Lint
```bash
npm run build            # TypeScript check + Vite build + app-shell sync
npm run lint             # ESLint across src/ and api/
```

### Tests
```bash
npm run test:app         # Full Playwright E2E suite (requires running server)
npm run test:app -- --grep "report"  # Run a single test by name
```

### Supabase
```bash
npm run supabase:auto    # One-command: env fix → connectivity check → migration sync → apply
npm run supabase:doctor  # Connectivity diagnostics
npm run supabase:migrations:sync  # Sync scripts/sql/*.sql → supabase/migrations/
npm run supabase:migrate # Apply pending migrations
```

## Architecture

### Monorepo Layout
- `src/` — React 19 + Vite 7 + TypeScript frontend SPA
- `api/` — Vercel serverless functions (edge handlers + `_handlers/` implementation logic)
- `mobile/` — Expo React Native app (wraps the web app in a WebView)
- `supabase/` — Supabase config + migration files
- `scripts/sql/` — Canonical migration source (synced to `supabase/migrations/` by script)
- `tests/` — Playwright E2E tests
- `docs/` — Runbooks, release playbooks, QA checklists, working memory

### Frontend (`src/`)

**Entry**: `src/main.tsx` routes between `/register` (RegisterPage) and `/app` (App).

**Core pattern**: `src/app/App.tsx` is the top-level orchestrator composing:
- `MapView` (Leaflet map)
- `BottomSheet` (dynamic panel with beach detail, reports, reviews, profile)
- A set of hooks that manage all async state

**Key hooks** (in `src/app/`):
- `useReportsFeed` — crowd report state + polling
- `useReportSubmission` — upload & submit flow
- `useBeachProfiles` — beach profile cache + fetch
- `useBeachWeather` — weather data polling
- `useAccountSync` / `useAccountActions` — auth session + mutations (favorites, delete)
- `useGeoLocation` — browser geolocation

**Data flow**: Hooks → `src/lib/` (pure API/Supabase calls) → Supabase or `/api/` endpoints.

**i18n**: All UI strings are in `src/i18n/it.ts` (Italian only). Always add new strings there rather than inline.

### API (`api/`)

Two-layer structure:
- `api/*.ts` — thin Vercel entry points (exports a handler)
- `api/_handlers/*.ts` — actual implementation logic

The `api/reports.ts` endpoint is a router: Vercel rewrites for `analytics`, `legal-config`, `reports-prune`, and `beach-enrich` all pass through `/api/reports?action=...`.

Security utilities live in `api/_lib/security.ts` (bearer token validation, timing-safe comparison, env reading).

### App Gating

The app at `/app/` is access-controlled:
- Requires `br_app_access=1` cookie **or** `?key=<APP_ACCESS_KEY>` query param
- The `/api/app-access` endpoint validates the key and sets the cookie
- Vite dev middleware enforces the same gate in `landing:dev` mode
- The key can be stored as plain text or SHA-256 hash in env

### Mobile (`mobile/`)

The mobile app is a thin Expo shell that opens the web `/app/` experience in a WebView (`mobile/src/components/WebSurface.tsx`). Almost all product logic is in the web layer.

- `mobile/.env` is pre-configured for local dev (points to `localhost:3000`)
- Use `npm run mobile:ios` exclusively for dev (not `landing:dev` + API in parallel)
- EAS profiles: `development`, `preview` (internal), `production` (App Store)
- Run `npm install --prefix mobile` if Expo commands fail (dependencies not installed)

### Database

Supabase (Postgres). Key tables:
- `beach_reports` — crowd reports with expiry
- `beach_profiles` — enriched beach metadata
- `reviews` — user beach reviews
- `auth_favorites` — user favorite beaches
- `analytics_events` — anonymous server-side events
- `rewards` / `badges` — user reward tracking (migration 13)

**Migration workflow**: Edit SQL in `scripts/sql/`, then run `npm run supabase:auto` to sync and apply.

### Feature Flags

All feature flags are in `src/config/features.ts`, driven by `VITE_*` environment variables. Check there before adding conditional behavior.

### Vercel Config

`vercel.json` controls:
- Security headers on all routes
- HTTPS + apex domain redirects
- App gate redirect (no cookie → `/landing/`)
- Cron: `POST /api/reports-prune` daily at 03:17 UTC

## Landing (`public/landing/`) — state and traps (2026-09-23)

The landing is shown as a case study on pionio.it; last pass on 23/09/2026 (`fd4ae83`, `312b765`).
- `public/landing/tailwind.css` is **prebuilt**: after adding any Tailwind class, rebuild from the repo root with
  `npx tailwindcss@3.4.17 -c public/landing/tailwind.landing.config.cjs -o public/landing/tailwind.css --minify`,
  or the class simply does not exist.
- Local preview with live reload: `npx live-server@1.2.2 public --port=5180 --host=0.0.0.0` (root must be `public/`,
  the page uses absolute paths like `/sequence/`).
- iubenda: the landing ships the all-in-one **widget** only; `public/legal/runtime.js` skips its own cookie solution
  when that widget is on the page (other pages still use the runtime). The iubenda warning badge is an account-side
  issue, not code.
- Navbar colours live in `styles.css` (`is-scrolled`, `is-over-dark` + `data-nav-theme="dark"` on dark sections);
  the script only toggles state.
- Radar sequence: desktop frames are fitted below `#navbar` at 78% with feathered edges (`drawFrame` in `scripts.js`);
  beats are full-stage with an edge scrim, bottom subtitles on phones.
- Icons: one Lucide set, inline SVG (the jellyfish is hand-drawn on the 24 grid).

## Key Docs

- `docs/repo_map.md` — module boundaries and conventions
- `docs/auth_regression_log.md` — auth incident history and mandatory guardrails
- `docs/mobile_qa_checklist.md` — QA checklist before mobile releases
- `docs/CODEX_RELEASE_MEMORY.md` — OTA vs store release decision playbook
