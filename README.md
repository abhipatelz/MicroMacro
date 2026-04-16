# MicroMacro — Pharma QA Project Management

MicroMacro is a self-hostable project & task management tool designed for the
QA / IT department of a pharmaceutical company. It is tuned to how pharma QA
actually runs — **macro** projects (CSV / GAMP 5 validations, SOPs, Deviations,
CAPAs, Change Controls, Audits) with their **micro** checklists, phased
lifecycles, QA sign-off gates, GxP criticality, and yearly employee visibility.

> Built by the QA IT team at Alembic Pharma as a side project — fully self-
> contained, no external SaaS, data stays on your server.

---

## ✨ Feature mapping to the brief

The manager's requirements and where they live in this app:

| # | Requirement | Where it is |
| - | --- | --- |
| 1 | Employee can see *their* bucket of tasks | `My Dashboard` (`/`) — open/overdue/done filters, subtasks list, due dates, GxP and QA sign-off badges |
| 2 | Employee-level project/task completion view | `My Dashboard` stats (completion rate, due this week, overdue) + `Yearly View` (monthly chart, big deliveries, early-completion) |
| 3 | Pharma QA lifecycle customisation | `New project` uses **lifecycle templates**: CSV / GAMP 5, SOP, Deviation & CAPA, Change Control, Audit, Process/Method Validation — each with phases, default tasks, QA sign-off & GxP-critical defaults, and regulatory refs (21 CFR Part 11, EU Annex 11, ICH Q10, etc.) |
| 4 | Team-wise view of current progress and micro-tasks | `Teams` → a team — three tabs: **Team progress** (per-project and per-member load with progress bars), **Micro-tasks** (every active sub/task across the team's projects), **Projects** |
| 5 | Higher-level view of sub-tasks the team members need to complete | `Teams/:id` → Micro-tasks tab, plus `Org overview` for managers (org-wide: open tasks, overdue, GxP-critical open, QA sign-off pending, lifecycle & status pies, team load) |
| 6 | Yearly view — big tasks completed + micro-tasks completed before deadline (extra effort) | `Yearly View` (`/yearly`) — monthly bar chart, **big deliveries** (GxP/QA-signoff/approvals), **early completions** (anything closed before its due date), and an **extra-effort score** (sum of days-early) |

---

## 🧱 Tech stack

- **Backend**: Node.js + Express + `better-sqlite3` (single-file DB) + JWT auth, Zod validation
- **Frontend**: React 18 + Vite + Tailwind CSS + React Router + Recharts
- **Database**: SQLite (file lives at `server/data/micromacro.db`), auto-migrated on boot
- **Auth**: JWT bearer tokens, roles: `employee`, `lead`, `manager`, `admin`
- **Monorepo**: `npm` workspaces, a single `npm install` pulls everything

---

## 🚀 Quickstart (local dev)

Requirements: **Node.js 18+** and npm.

```bash
# 1. install
npm install

# 2. seed demo data (9 users, 3 teams, 5 pharma QA projects with templates,
#    historic completions for the yearly view)
npm run seed

# 3. run dev servers (API on :4000, client on :5173 with proxy)
npm run dev
```

Open <http://localhost:5173> and sign in with any demo account (shown on the
login screen), for example:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@alembic.local` | `admin123` |
| QA Head (manager) | `priya@alembic.local` | `priya123` |
| CSV Lead | `rahul@alembic.local` | `rahul123` |
| SOP Lead | `ananya@alembic.local` | `ananya123` |
| QA Analyst | `karan@alembic.local` | `karan123` |
| QA Analyst | `neha@alembic.local` | `neha123` |
| CSV Engineer | `vikram@alembic.local` | `vikram123` |
| Validation Specialist | `meera@alembic.local` | `meera123` |
| QA Reviewer | `arjun@alembic.local` | `arjun123` |

## 🏭 Production build (single server)

```bash
npm install
npm run seed        # optional, only first time
npm run build       # builds the React client into client/dist
npm run start       # API + SPA fallback on :4000
```

The Express server automatically serves `client/dist` when present, so a single
Node process handles both the API and the UI.

### Configuration

Copy `server/.env.example` to `server/.env` and adjust:

```
PORT=4000
JWT_SECRET=change-me-in-production
DB_PATH=./data/micromacro.db
CLIENT_ORIGIN=http://localhost:5173    # CORS allowlist for dev
```

## 🧬 Pharma QA lifecycles

Each of these is a first-class template under `server/src/lifecycles.js`. When
you create a project and pick a lifecycle, the matching phases and default
tasks are created automatically, pre-flagged with GxP-critical and requires-QA-
sign-off where appropriate.

- **CSV / GAMP 5** — Planning & Risk · URS/FS/DS · Build · IQ/OQ/PQ · Release · Operational phase
- **SOP** — Authoring · Review · Approval · Training · Periodic Review
- **Deviation / CAPA** — Identification · RCA · CAPA definition · Execution & Closure
- **Change Control** — Proposal · Impact assessment · Approval · Implementation · Verification
- **Audit / Inspection** — Preparation · Execution · Findings & CAPA · Follow-up
- **Process / Method Validation** — VMP · Protocol · Execution · Report
- **Generic** — simple planning/execution/closure for non-pharma-specific work

Adding a new lifecycle is just a new entry in `LIFECYCLES` and it immediately
becomes selectable in the UI.

## 📡 API at a glance

All endpoints under `/api`; all except `/auth/*` and `/health` require a
`Authorization: Bearer <token>` header.

```
POST   /auth/register          { email, name, password, role?, title? }
POST   /auth/login             { email, password }
GET    /auth/me

GET    /users
PATCH  /users/:id

GET    /teams
POST   /teams
GET    /teams/:id
POST   /teams/:id/members
DELETE /teams/:id/members/:userId
GET    /teams/:id/board
GET    /analytics/team/:id/progress

GET    /lifecycles
GET    /lifecycles/:key

GET    /projects                (?team_id=&status=&lifecycle=&q=)
POST   /projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id

POST   /tasks
GET    /tasks/:id
PATCH  /tasks/:id
POST   /tasks/:id/signoff       (lead/manager/admin)
DELETE /tasks/:id
POST   /tasks/:id/subtasks
POST   /tasks/:id/comments
PATCH  /subtasks/:id
DELETE /subtasks/:id

GET    /me/tasks
GET    /me/summary
GET    /analytics/user/:id/year?year=YYYY
GET    /analytics/org/overview
```

## 🧪 What counts as a "big delivery" / "early completion"

- **Big delivery** (yearly view): a completed task that is `gxp_critical` or
  `requires_qa_signoff` or of type `approval` / `audit_finding`.
- **Early completion**: any task or subtask closed before its `due_date`. The
  **extra-effort score** is the sum of days saved (capped at 30 per item so
  one very old completion doesn't dominate).

## 🗂️ Project layout

```
.
├── server/                 Express API + SQLite
│   ├── src/index.js        routes
│   ├── src/db.js           schema + migrate
│   ├── src/lifecycles.js   pharma QA templates
│   ├── src/auth.js         JWT helpers
│   └── src/seed.js         demo data
├── client/                 React + Vite + Tailwind
│   ├── src/pages/          route components
│   ├── src/ui.jsx          shared UI primitives (tags, cards, avatars…)
│   ├── src/api.js          fetch wrapper
│   └── src/auth.jsx        React auth context
└── package.json            workspaces
```

## 🔒 Security notes for production

- Change `JWT_SECRET` in `.env`.
- Put Nginx / Caddy in front for TLS.
- The DB is a single file — back it up (`cp server/data/micromacro.db …`).
- Optional hardening: add rate-limiting, move `activity_log` behind an archive,
  and wire up SSO.

## 🗺️ Where to go next (stretch ideas)

- Email / Teams notifications on QA sign-off pending and overdue GxP-critical tasks
- Electronic signature (Part 11) — password re-prompt on sign-off
- Gantt view per project (dependency + critical path)
- File attachments per task (evidence, validation protocols, etc.)
- Periodic review scheduler (SOPs, CSV annual reviews) auto-creating projects
