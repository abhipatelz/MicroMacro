# Pragati

> Project intelligence for QA-IT teams in pharma. A bird's-eye view of every project, every action, every contributor — minus the noise.

[![CI](https://img.shields.io/badge/CI-passing-22c55e.svg)](#testing)
[![Stack](https://img.shields.io/badge/stack-Next.js%2014%20·%20MongoDB%20·%20TypeScript-1565C0.svg)](#stack)
[![Compliance](https://img.shields.io/badge/21%20CFR%20Part%2011-aware-9333EA.svg)](./CLAUDE.md)
[![License](https://img.shields.io/badge/license-Private-64748b.svg)](#license)

---

## What it is

A lightweight project + task tracker built for QA-IT teams in the pharmaceutical sector. Invite-only — no public sign-ups, no marketing pages.

Three roles:

| Role | What they see |
| --- | --- |
| **Contributor** | Their own tasks, their My Day, their personal projects. |
| **Team Lead** | Their teams, projects and tasks; assigns work; tracks progress. |
| **Admin** | Full workspace control, user management, operations + audit log. |
| **Master Admin** (dormant) | Cross-tenant provisioning, when multi-tenant runtime is enabled. |

## Highlights

- **Bird's-eye view** — a full-screen SVG tree of `team → project → task → assignee`. Opens from the dashboard, team detail, or project detail page. Export as PDF or SVG.
- **Mind map on My Day** — a personal node-link canvas for capturing thoughts before they become tasks. Owner-private, autosaves per user.
- **Lifecycle templates** — Change Control, CSV/GAMP 5, SOP Dev, CAPA, Deviation, Audit, Validation, Agile Sprint, plus Personal templates for ICs.
- **ALCOA+ audit trail** — every record change carries a signed, immutable trail (who, what, when, why). Personal projects never enter the cross-user log.
- **Dashboard "Up Next"** — colour-coded urgency pills (overdue / today / ≤2d / future) on every due-row, with filter chips (week / next week / month / until-date).
- **Activity graph** — GitHub-style contribution heatmap with role-based achievements (Milestone Achiever, On-Time Streak, Project Finisher, Mentor, Load Balancer, …).
- **Reports** — Excel (interactive), PDF, CSV, HTML exports for both projects and teams. Print preview before save.

## Run locally

```bash
cp .env.example .env.local        # set MONGODB_URI, JWT_SECRET, APP_URL
npm install
npm run dev                       # http://localhost:3000
```

For an isolated dev DB without Atlas:

```bash
USE_IN_MEMORY_MONGO=true npm run dev
```

> The in-memory mode downloads a Mongo binary on first start. If MongoDB's archive 403s a particular version, override with `MONGOMS_VERSION=7.0.7` (or any [available release](https://www.mongodb.com/download-center/community/releases/archive)).

## Demo data

Drop a believable workspace into your existing database with one command:

```bash
npm run seed:demo                 # 30 users, 6 teams, 14 projects, mixed task statuses
npm run seed:demo -- --clean      # wipe demo records (real data untouched)
```

Demo accounts (password `Demo@1234`):

| Email | Role |
| --- | --- |
| `demo.lead@pragati.local` | Team Lead (best for screen-recordings) |
| `demo.ic@pragati.local` | Individual Contributor |
| `demo.<first>@pragati.local` | 13 supporting contributors |

Details: [`docs/DEMO_ENVIRONMENT.md`](./docs/DEMO_ENVIRONMENT.md).

## Production

Full launch runbook (env vars, smoke test, uptime monitor, rollback): [`docs/LAUNCH_CHECKLIST.md`](./docs/LAUNCH_CHECKLIST.md).

Performance budgets and profiling guide: [`docs/PERFORMANCE.md`](./docs/PERFORMANCE.md).

## Stack

Next.js 14 (App Router) · TypeScript · MongoDB / Mongoose · Zod · Tailwind · JWT + bcrypt + httpOnly cookie. No NextAuth, no Prisma, no third-party identity provider — by design, for 21 CFR Part 11 §11.10(d) traceability.

Architecture deep-dive: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Architectural invariants

The constraints in [`CLAUDE.md`](./CLAUDE.md) are not suggestions:

- **QA triage engine** stays rule-based — never an LLM call on the scoring path.
- **Auth** stays hand-rolled (JWT + bcrypt + httpOnly cookie). No NextAuth, Clerk, Auth0, Supabase Auth.
- **Persistence** stays Mongoose. No Prisma, Drizzle, TypeORM.
- **API bodies** validate through the central Zod schemas in `src/lib/validations.ts`.

Don't relax those without talking to the QA lead first.

## Scripts

```bash
npm run dev               # local dev server
npm run build             # production build
npm run typecheck         # tsc --noEmit
npm run lint              # next lint
npm run test:unit         # 56 unit tests — node:test via tsx (no DB / no browser)
npm run e2e               # Playwright suite (needs a browser + Mongo)
npm run smoke-prod <url>  # read-only smoke test against a live deployment

# Operator scripts
npm run set-admin <email>            # promote a user to admin
npm run set-password <email> <pw>    # bootstrap a password from CLI
npm run cleanup-users                # drop everyone not from the invite flow
npm run seed                         # canonical seed
npm run seed:demo                    # demo workspace seed (see Demo data above)
```

## Testing

Two layers, both runnable from a clean checkout:

- **Unit** (`npm run test:unit`) — zero-infra tests on the Node built-in runner via `tsx`. Covers the rule-based triage scoring, priority-weighted progress, contribution weights, lifecycle ↔ Zod-enum sync invariant, and request schemas. No database, no browser.
- **End-to-end** (`npm run e2e`) — Playwright drives auth, dashboard, projects, teams and core UX flows against a real server backed by an in-memory Mongo. See [`docs/E2E.md`](./docs/E2E.md).

CI runs both on every push (see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Multi-tenant (dormant)

Pragati ships with a scaffolded master-admin / database-per-tenant runtime, currently inactive. The default deployment runs as a single tenant named `default`. To enable:

1. Set `PRAGATI_MULTI_TENANT=true` in the hosting environment.
2. Provision a fresh Mongo database for the new tenant.
3. Insert the corresponding `tenants` document (slug, dbName, customDomain, plan, quotas).
4. Promote one user to the `master_admin` role.

The `/master-admin` console renders a status board explaining the steps until the runtime is active.

## License

Private. Internal QA-IT use only.
