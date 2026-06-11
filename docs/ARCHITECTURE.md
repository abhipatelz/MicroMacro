# Architecture

A high-level map of Pragati for reviewers. For how this design scales (tenant
sharding, growth tiers, the levers already built), see [`SCALING.md`](./SCALING.md).

## Stack

- **Next.js 14** (App Router, React Server Components) + **TypeScript**
- **Tailwind CSS** for styling
- **MongoDB** via **Mongoose** (`src/models/*`, cached connection in
  `src/lib/db.ts`)
- **Custom auth** — JWT + bcrypt + httpOnly cookies (`src/lib/auth.ts`,
  `jwt.ts`, `password.ts`). No third-party identity provider.
- **Deterministic QA triage** — rule-based engine (`src/lib/ai/*`), no LLM in
  the scoring path.

## Request / data flow

```mermaid
flowchart LR
  Browser["Browser (client components)"] -->|httpOnly JWT cookie| Edge["Next.js route handler / RSC"]
  Edge -->|getCurrentUserFromCookie / validateSession| Auth["lib/auth + lib/jwt"]
  Edge -->|await connectDB| DB[("MongoDB / Mongoose")]
  Edge -->|Zod validate| Validations["lib/validations"]
  Edge -->|logOperation| Audit[("Audit trail")]
  Edge -->|serialize| Browser
```

- **Reads:** server components call `lib/*` data builders
  (`leadDashboard.ts`, `projectDetail.ts`, `contributions.ts`) directly against
  Mongoose and pass serialized props into client components for first paint.
- **Mutations:** client `api()` calls hit `/api/**` route handlers, which
  `await connectDB()`, validate the body through `lib/validations.ts`, mutate
  via a model, and write an audit entry with `logOperation`.
- **Sessions:** every JWT carries `sv` (sessionVersion) and `sid`
  (activeSessionId); `validateSession` rejects superseded or force-logged-out
  tokens on the next request.

## Component tree (top level)

```mermaid
flowchart TD
  Root["app/layout.tsx (RootLayout)"] --> Authed["(authed)/layout.tsx"]
  Authed --> Shell["AppShell (sidebar, account menu, notifications)"]
  Shell --> Dashboard["DashboardClient"]
  Shell --> Projects["ProjectsClient / ProjectDetailClient"]
  Shell --> Teams["TeamsClient / Team detail"]
  Shell --> People["PeopleClient (admin)"]
  Shell --> MyDay["MyDayClient"]
  Shell --> Settings["SettingsClient"]
  Dashboard --> ActivityGraph["ActivityGraph (lazy)"]
  Settings --> ActivityGraph
```

## Roles

| Capability | Contributor | Lead | Admin | Master Admin |
| ---------- | :---------: | :--: | :---: | :----------: |
| Work assigned tasks | ✅ | ✅ | ✅ | ✅ |
| My Day + personal projects + Mind map | ✅ | ✅ | ✅ | ✅ |
| Bird's-eye view (team / project) | — | ✅ | ✅ | ✅ |
| Create shared projects / teams, assign work | — | ✅ | ✅ | ✅ |
| See **every** team, shared project and task (workspace scope) | — | — | ✅ | ✅ |
| Admin console (`/admin`), manage users (People), audit log (Logs) | — | — | ✅ | ✅ |
| Bulk user actions, force logout, delete any shared record | — | — | ✅ | ✅ |
| Tenant registry, cross-tenant provisioning | — | — | — | ✅ (dormant) |

**`lib/permissions.ts` is the single source of truth for this table** — a
dependency-free capability matrix (`can(role, capability)`, `rolesWith()`)
importable from client components, server components, and route handlers
alike, so the UI and the API can never disagree about who may do what.
Route guards spread it into `requireRole(req, ...rolesWith('users.manage'))`;
scope filters ask `can(role, 'workspace.view_all')`. The thin helpers in
`lib/auth.ts` (`isLead`, `isAdmin`, `isMasterAdmin`, `canMutate`) remain for
simple hierarchy checks, and every mutating route is enforced
**server-side**. The UI also hides privileged controls (e.g. contributors
are locked to personal projects on `/projects/new`) so the role boundary
is felt, not just enforced.

Two deliberate carve-outs survive even `workspace.view_all`: **personal
projects** stay visible only to their owner (never to admins, never in the
audit trail), and lead-initiated **destructive actions** (task/phase
deletion) stay owner-gated — admins may always act, but everything lands in
the audit trail. The `master_admin` role is dormant: it's recognised
everywhere but no one is promoted to it until the multi-tenant runtime is
activated.

## Key directories

```
src/
  app/
    (authed)/        role-gated pages (dashboard, projects, teams, people,
                     my-day, master-admin, audit, …)
    api/             route handlers — the only place that mutates data
  components/        shared UI (AppShell, ActivityGraph, BirdsEyeView,
                     MindMap, ExportMenu, DatePicker, Select, ui.tsx, …)
  lib/               auth, db, validations, serialize, audit, tenants,
                     data builders (leadDashboard, projectDetail,
                     contributions, lifecycles)
  models/            Mongoose schemas — single source of truth for
                     persistence (User, Project, Task, Team, MindMap,
                     Tenant, AuditLog, Notification, …)
docs/                launch checklist, rollout, performance, demo env,
                     E2E, this file
```

## Visualisation components

| Component | Where it mounts | Purpose |
| --- | --- | --- |
| `BirdsEyeView` | Dashboard (workspace scope), team detail, project detail | Hierarchical SVG tree of team → project → task, with curved Bézier edges, zoom, and PDF/SVG export. Pure SVG, no graph library. |
| `MindMap` | My Day (collapsible panel) | Per-user node-link canvas. Click to add, drag to move, side-handle to connect. Autosaves via PUT `/api/scratch/mindmap`. Owner-private. |
| `ActivityGraph` | Dashboard (lead contributor modal), Settings | GitHub-style heatmap of completed work + role-based achievements. Lazy-loaded via `next/dynamic` and pre-warmed by `preloadActivityGraphData()`. |

## Compliance touchpoints

- **21 CFR Part 11** — immutable audit trail on every record mutation;
  re-authenticated e-signatures (password + reason) for controlled actions.
- **ALCOA+** — deactivation over deletion keeps records attributable & enduring.
- **GAMP 5 / CSV** — deterministic, unit-testable triage scoring so any severity
  is traceable to a line of code or a KB entry.
