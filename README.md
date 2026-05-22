# Pragati — Quality Informatics Project Tracker

> Project & task tracker for pharma QA-IT team leads. Phase 1: minimal, fast, single-purpose.

**Live:** https://pragatialm.vercel.app

---

## What it does (phase 1)

Pragati gives a QA-IT team lead one place to see **what's running, what's due, and who's on what** — and nothing else.

The dashboard has three panels and that's the entire surface area:

1. **Projects** — every project the lead is accountable for, with code, lifecycle, owner, progress, open / overdue task counts, due date, and a rule-based health badge (healthy / at-risk / critical).
2. **Pending tasks** (sticky right rail) — the lead's own open tasks bucketed by due window: **Overdue · This week · Next week · Later**. Always visible while scrolling.
3. **Team workload** — every team member as a row: open tasks, overdue, completed in last 7 days, and a load level (healthy / busy / overloaded).

That's it. No analytics tabs. No AI copilot. No org dashboards. No yearly view. Drilling into a project still opens the full Kanban board and task workflow, but the lead's home is one screen.

### Auth
- Pragati is **lead-only**. Employees stay in the database as assignable people but cannot sign in.
- New leads join via one-time **invite links** generated from the profile menu. Single-use, 7-day expiry, full audit trail (who invited whom, when consumed) — 21 CFR Part 11 §11.10(d).

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Database | MongoDB via Mongoose |
| Auth | JWT + bcrypt + httpOnly cookies |
| Validation | Zod (every API body) |
| Styling | Tailwind CSS |
| Excel export | ExcelJS |
| Deployment | Vercel |

---

## Getting started

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or in-memory mode for local dev)

### 1. Clone and install

```bash
git clone https://github.com/abhipatelz/MicroMacro.git
cd MicroMacro
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Required
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/pragati

# Required — generate with: openssl rand -base64 48
JWT_SECRET=your-long-random-secret

# Optional — for local dev without MongoDB Atlas
USE_IN_MEMORY_MONGO=true

# Required for password reset emails
SMTP_HOST=smtp.yourprovider.com
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
APP_URL=https://yourdomain.com
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. First login

The very first user to hit `/login`'s sign-up form becomes the **workspace lead**. After that, self-registration is disabled. Every subsequent lead must be invited via the **profile menu → Invite a lead** flow.

### 5. Useful scripts

```bash
npm run dev        # Start dev server on :3000
npm run build      # Production build
npm run start      # Run production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run seed       # Seed demo data (scripts/seed.ts)
```

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel link
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel --prod
```

Standard Next.js App Router project. The included `vercel.json` is intentionally minimal.

---

## Access model

Only one role can sign in: **lead** (legacy name `pm` still accepted for back-compat). Employees exist as assignable records but receive 403 from `/api/auth/login`.

| Capability | Lead |
|---|:---:|
| Dashboard (Projects · Pending · Team workload) | ✓ |
| Projects — view / create / edit / delete | ✓ |
| Tasks — create / update / sign off | ✓ |
| Invite another lead | ✓ |
| Settings (profile, notifications, password) | ✓ |

Destructive project deletion requires password re-entry (21 CFR Part 11 audit intent).

---

## Project structure

```
src/
├── app/
│   ├── (authed)/              # All authenticated pages
│   │   ├── page.tsx           # Dashboard (the three-panel home)
│   │   ├── projects/          # List, detail (Kanban), new
│   │   ├── tasks/[id]/        # Task detail, comments, sign-off, effort
│   │   └── settings/          # Profile, security, notifications
│   ├── api/                   # API routes
│   │   ├── auth/              # login, signup, register, password, forgot/reset
│   │   ├── invites/           # invite-link issuance + validation
│   │   ├── projects/          # CRUD + export (xlsx) + calendar (.ics)
│   │   ├── tasks/             # CRUD + subtasks + comments + sign-off + effort
│   │   ├── teams/             # GET only (filter dropdowns)
│   │   ├── users/             # /me read/update
│   │   ├── lifecycles/        # lifecycle template list (filter dropdowns)
│   │   ├── insights/          # per-project health + per-user workload (dashboard)
│   │   ├── dashboard/         # personal dashboard payload
│   │   └── me/                # /me/summary, /me/tasks
│   ├── login/                 # Public login
│   ├── signup/                # Public invite-token signup
│   ├── forgot-password/       # Public password-reset request
│   └── reset-password/        # Public password-reset token consumer
├── components/
│   ├── AppShell.tsx           # Sidebar, top bar, profile menu, notifications
│   ├── InviteLeadModal.tsx    # Invite-a-lead modal (portal)
│   ├── CommandPalette.tsx     # ⌘K global search
│   ├── ui.tsx                 # Shared primitives (Card, Avatar, LifecycleTag, …)
│   └── Toast.tsx              # Toast notifications
├── lib/
│   ├── auth.ts                # JWT helpers (requireUser, requireRole, isLead)
│   ├── db.ts                  # MongoDB connection (cached)
│   ├── http.ts                # readBody, handleError
│   ├── validations.ts         # Zod schemas — single source of truth
│   ├── serialize.ts           # Mongoose -> JSON helpers
│   ├── lifecycles.ts          # Pharma lifecycle templates
│   ├── mailer.ts              # Password reset emails
│   ├── ics.ts                 # Calendar (.ics) export
│   ├── naturalDate.ts         # "next monday" date parsing
│   ├── culture.ts             # Workspace defaults
│   ├── devSeed.ts             # Seed data for in-memory mode
│   └── client/api.ts          # Frontend fetch wrapper
└── models/                    # Mongoose schemas
    ├── User.ts
    ├── Invite.ts
    ├── Project.ts
    ├── Task.ts
    ├── Team.ts
    └── PasswordReset.ts
```

---

## Compliance posture

Pragati is designed as a validated GxP application against:

- **CSV** (Computerized System Validation) — the system itself
- **GAMP 5** — components categorised by software category (Cat 3 / 4 / 5)
- **21 CFR Part 11** — electronic records & electronic signatures, immutable audit trails, password re-entry on destructive actions, invite audit trail for §11.10(d) access control
- **ALCOA+** — Attributable, Legible, Contemporaneous, Original, Accurate, plus Complete, Consistent, Enduring, Available

See [`CLAUDE.md`](./CLAUDE.md) for non-negotiable architectural constraints (auth must remain custom JWT, DB must remain Mongoose, Zod at every write boundary).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs (min 32 chars) |
| `USE_IN_MEMORY_MONGO` | Dev only | Set `true` to skip MongoDB Atlas in local dev |
| `SMTP_HOST` | For email | SMTP server hostname |
| `SMTP_USER` | For email | SMTP username |
| `SMTP_PASS` | For email | SMTP password |
| `APP_URL` | For email | Public URL used in password reset + invite links |

---

## Phase 2 (not built)

Deliberately deferred until phase 1 is in real use and the team asks for them:

- Org-wide analytics, trends, velocity charts
- QA-event triage assistant (rule-based; logic preserved out of tree, not removed permanently)
- Conversational QA copilot
- Yearly contributor view
- Team management UI
- People management UI

The shape of phase 2 follows from what leads actually need once phase 1 is daily-driven, not from what we can imagine in advance.

---

## License

Private — internal use only.
