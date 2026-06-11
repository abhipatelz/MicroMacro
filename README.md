# Pragati

> The project tracker that sees the whole organisation as one living tree — and learns how your people actually deliver. Every project, every action, every contributor, minus the noise.

[![CI](https://img.shields.io/badge/CI-passing-22c55e.svg)](#testing)
[![Stack](https://img.shields.io/badge/stack-Next.js%2014%20·%20MongoDB%20·%20TypeScript-1565C0.svg)](#stack)
[![Audit trail](https://img.shields.io/badge/audit%20trail-signed%20%26%20immutable-9333EA.svg)](./docs/ARCHITECTURE.md)
[![License](https://img.shields.io/badge/license-MIT-64748b.svg)](./LICENSE)

---

## What it is

**One promise: everyone sees the whole board.** Pragati gives every person — contributor, lead, or admin — a bird's-eye view of everything moving in the team, plus a private space only they can see. It was forged in pharma QA-IT (so it carries a 21 CFR Part 11-grade audit trail and GxP lifecycles out of the box), but the model is universal: any team that wants total clarity without total surveillance. Invite-only — no public sign-ups, no marketing pages.

| Role | What they see |
| --- | --- |
| **Contributor** | Their own tasks, their My Day, and truly private personal projects (invisible to everyone — including admins). |
| **Team Lead** | Their teams, projects and tasks; assigns work; tracks progress. |
| **Admin** | Full workspace control, user management, operations + audit log. |
| **Master Admin** (dormant) | Cross-tenant provisioning, when multi-tenant runtime is enabled. |

## Highlights

- **Admin console** — `/admin` puts the whole workspace on one server-rendered page: people/team/project/task counts, an attention queue (locked accounts, pending invites, forced password resets), the latest audit activity, and one-click entry into every admin surface. Admins see *everything* (every team, every shared project) — except personal projects, which stay private to their owners by design. One capability matrix (`src/lib/permissions.ts`) drives both the UI and the API, so what a role sees is exactly what it can do.
- **Bird's-eye view** — a full-screen, interactive SVG tree of `team → project → task → assignee`. Click any card (or the connector leading to it) to expand or hide its branch, drag cards to rearrange, sketch over the canvas with the brush, quick-edit assignee/TCD inline, and export the exact on-screen view as PDF, SVG, or image. Opens from the dashboard, team detail, or project detail page.
- **Early warning, learned per person** — the dashboard quietly flags open work that is *likely to miss its date* before it does: a tiny model learns each person's real median cycle time and past-due rate from their own history and weighs it against the runway left and competing open work. No external AI service, no extra queries — computed in-process over data already loaded, every score traceable to a line of code (`src/lib/ai/slipRisk.ts`).
- **Your reference scheme, not ours** — every project carries a user-pickable reference type plus your own number, shown everywhere instead of the system-generated code. Your numbering scheme survives the tool; the tool doesn't impose one.
- **Owner-gated deletions** — tasks and phases can only be deleted by the **project owner** (and workspace admins). Leads manage work; only the owner can destroy it. Deleting a phase never deletes its tasks — they move to *Unphased*, and the action lands in the audit trail.
- **Lifecycle templates** — a library of structured workflows (engineering change, incident management, audits, validation, sprints, training programs, vendor qualification, …) plus Personal templates for ICs — or define your own.
- **Signed, immutable audit trail** — every record change carries who, what, when, and why. Personal projects never enter the cross-user log. Editing a project's reference number writes a before/after record.
- **Mind map on My Day** — a personal node-link canvas for capturing thoughts before they become tasks. Owner-private, autosaves per user.
- **Public profiles** — a within-workspace profile at `/<username>` with a contribution heatmap, an optional GitHub link, and Follow / Unfollow for colleagues.
- **Sidebar calendar** — a compact month grid pinned above My Day, dotted with what's due (mine / team / overdue) and a hover card listing the day's work.
- **Dashboard "Up Next"** — colour-coded urgency pills (overdue / today / ≤2d / future) on every due-row, with filter chips (week / next week / month / until-date).
- **Activity graph** — GitHub-style contribution heatmap with role-based achievements (Milestone Achiever, On-Time Streak, Project Finisher, Mentor, Load Balancer, …).
- **Reports** — Excel (interactive), PDF, CSV, HTML exports for both projects and teams. Print preview before save.
- **Productivity touches** — resizable sidebar, global keyboard shortcuts (`G D/P/T/M` to navigate, `?` for the shortcut sheet), custom team avatars, and per-page loading skeletons that mirror each real layout.
- **A living login screen** — attributed wisdom from Jobs, Naval, Bezos, Musk, Franklin, Jensen Huang, and Ellison, daily-seeded, refreshable forever via `QUOTES_FEED_URL` (a public JSON you host) with the built-in library as permanent fallback.
- **AI, deep but minimal** — the rule-based engine decides everything (an architectural invariant); Gemini may only *rephrase* the already-decided Morning Brief headline (one cached call per user per day, instant fallback without a key). Plus the conversational Copilot and mind-map→tasks suggestions.
- **Daily rundown, four channels, free forever** — every user gets a role-aware **Morning Brief** (contributors: what's on my plate; leads: team pulse; admins: workspace rundown) rendered on the dashboard, as an optional **Web Push** notification (VAPID — no vendor, no cost), as a personal **calendar feed** (subscribe once in Outlook/Google/Apple), and as an opt-in **08:30 IST email** capped to the provider's free tier. Mail is provider-agnostic (`MAIL_PROVIDER=brevo|resend|webhook`) so an org can bring its own relay. See [Daily email digest](#daily-email-digest) and [`docs/SCALING.md`](./docs/SCALING.md).

## Security & data integrity

- **Hand-rolled auth** — JWT + bcrypt + httpOnly cookie, one active session per user, idle auto-logout, brute-force lockout.
- **Credential reuse prevention** — passwords and Quick PINs cannot repeat any of the last three used, enforced server-side on every change.
- **Password-signed sign-offs** — controlled status changes and sensitive account edits require password re-entry plus a reason, recorded verbatim in the audit trail.
- **Least-privilege destruction** — project deletion requires owner/admin + password re-auth; task and phase deletion is project-owner-only.
- **Read-through cache** — optional Upstash Redis layer on hot aggregations (dashboard, projects, people), inert when the env vars are absent.

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

How this scales — tenant-as-shard data model, the levers per growth tier, and the
rules that keep per-request work O(viewer): [`docs/SCALING.md`](./docs/SCALING.md).

## Daily email digest

An opt-in morning email of the tasks each user has due that day, sent at **08:30 IST**
(`0 3 * * *` UTC — see `vercel.json`). Everything is inert until configured, so the
app builds and runs without any of these.

1. **Email provider (free).** Create a [Brevo](https://www.brevo.com) account →
   *SMTP & API → API Keys* for `BREVO_API_KEY`, and verify a sender under *Senders*
   for `BREVO_SENDER_EMAIL`. No SMTP, no domain DNS required to start.
2. **Vercel env vars** (Project → Settings → Environment Variables):
   `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (optional),
   `CRON_SECRET` (`openssl rand -hex 32` — required for the scheduled send to run),
   and `APP_URL` (absolute site URL for in-email links). Redeploy.
3. **Collect addresses.** A real email is mandatory when an admin adds a user; for
   existing accounts, set it from **People → Edit → Notification email**.
4. **Tune & test.** As admin, open **Settings → Daily email — workspace settings** to
   choose what each digest contains, add an optional intro note, and **Send test to
   my email**. The panel shows a live setup checklist of what's still missing.

Each user controls whether they receive it from **Settings → Daily task email** (off by
default). The digest is a read-only projection of existing task data — it creates no
records and never touches the audit trail.

## Stack

Next.js 14 (App Router) · TypeScript · MongoDB / Mongoose · Zod · Tailwind · JWT + bcrypt + httpOnly cookie. No NextAuth, no Prisma, no third-party identity provider — by design, so every line of the auth and persistence path is owned, auditable code.

Server-rendered detail pages with streaming Suspense skeletons; an Edge middleware cookie pre-filter for auth; an optional Upstash Redis read-through cache on hot aggregations (inert without env vars); and Vercel serverless functions pinned to `bom1` (Mumbai) to co-locate with the Atlas `ap-south-1` cluster.

Architecture deep-dive: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Growth plan to web scale: [`docs/SCALING.md`](./docs/SCALING.md).

## Project structure

```
src/
├── app/                      # Next.js App Router
│   ├── (authed)/             # authenticated surfaces (shared AppShell layout)
│   │   ├── page.tsx          # dashboard
│   │   ├── projects/         # list · new · [id] detail
│   │   ├── teams/            # list · [id] detail
│   │   ├── people/           # admin-only user directory
│   │   ├── my-day/           # personal tasks + mind map
│   │   ├── settings/         # profile, security, preferences
│   │   ├── audit/            # immutable operations log
│   │   └── [username]/       # public-within-workspace profile
│   ├── api/                  # route handlers (auth, projects, tasks, teams, users…)
│   ├── login/                # unauthenticated entry
│   └── globals.css           # Tailwind layer + design tokens
├── components/               # UI — AppShell, BirdsEyeView, SidebarCalendar, ProfileView…
├── lib/                      # server + client logic
│   ├── ai/                   # rule-based triage + KB (never an LLM on the scoring path)
│   ├── flow/                 # Flow Signal meaningful-activity engine
│   ├── client/               # browser-only helpers (api client, hooks)
│   ├── auth.ts               # JWT sign/verify, sessions, bcrypt, RBAC helpers
│   ├── validations.ts        # central Zod schemas — the API boundary contract
│   ├── cache.ts              # optional Upstash read-through cache
│   └── serialize.ts          # Mongoose doc → JSON-safe shapes
├── models/                   # Mongoose schemas (User, Team, Project, Task, AuditLog…)
└── middleware.ts             # Edge cookie pre-filter for authed routes

docs/                         # ARCHITECTURE · PERFORMANCE · LAUNCH_CHECKLIST · E2E · ROLLOUT…
scripts/                      # operator + seed CLIs (tsx)
tests/                        # unit (node:test) + e2e (Playwright)
```

## Architectural invariants

These constraints are not suggestions:

- **QA triage engine** stays rule-based — never an LLM call on the scoring path.
- **Auth** stays hand-rolled (JWT + bcrypt + httpOnly cookie). No NextAuth, Clerk, Auth0, Supabase Auth.
- **Persistence** stays Mongoose. No Prisma, Drizzle, TypeORM.
- **API bodies** validate through the central Zod schemas in `src/lib/validations.ts`.
- **Destructive actions** (project / task / phase deletion) are ownership-gated and audited.

Don't relax those without talking to the QA lead first.

## Scripts

```bash
npm run dev               # local dev server
npm run build             # production build
npm run typecheck         # tsc --noEmit
npm run lint              # next lint
npm run format            # prettier --write on src, scripts, tests
npm run e2e               # Playwright suite (needs a browser + Mongo)
npm run smoke-prod <url>  # read-only smoke test against a live deployment

# Unit tests run on the Node built-in runner via tsx (no DB / no browser):
npx tsx --test tests/unit/*.test.ts

# Operator scripts
npm run set-admin <email>            # promote a user to admin
npm run set-password <email> <pw>    # bootstrap a password from CLI
npm run cleanup-users                # drop everyone not from the invite flow
npm run backfill-usernames           # backfill handles on legacy accounts
npm run migrate-roles                # migrate legacy pm/employee role aliases
npm run seed                         # canonical seed
npm run seed:demo                    # demo workspace seed (see Demo data above)
```

## Testing

Two layers, both runnable from a clean checkout:

- **Unit** (`npx tsx --test tests/unit/*.test.ts`) — zero-infra tests on the Node built-in runner via `tsx`. Covers the rule-based triage/quality-signal math (clustering + cosine similarity) and the Flow Signal meaningful-activity engine. No database, no browser.
- **End-to-end** (`npm run e2e`) — Playwright drives auth, dashboard, projects, teams and core UX flows against a real server backed by an in-memory Mongo. See [`docs/E2E.md`](./docs/E2E.md).

CI runs typecheck, lint and the production build on every push (see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Multi-tenant (dormant)

Pragati ships with a scaffolded master-admin / database-per-tenant runtime, currently inactive. The default deployment runs as a single tenant named `default`. To enable:

1. Set `PRAGATI_MULTI_TENANT=true` in the hosting environment.
2. Provision a fresh Mongo database for the new tenant.
3. Insert the corresponding `tenants` document (slug, dbName, customDomain, plan, quotas).
4. Promote one user to the `master_admin` role.

The `/master-admin` console renders a status board explaining the steps until the runtime is active.

## License

[MIT](./LICENSE)
