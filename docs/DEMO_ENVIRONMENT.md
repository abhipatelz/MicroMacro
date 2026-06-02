# Demo / Preview environment

A second deployment that mirrors **production code** exactly but uses its own
**Mongo cluster pre-loaded with rich demo data**. Use it for testing freshly
merged features, sales demos, screen-recordings, or onboarding new admins —
without ever touching real customer data.

Production and demo run from the *same* `main` branch (and the same Vercel
project). The only thing that differs between them is the `MONGODB_URI`
environment variable, so any new feature shipped to prod automatically appears
in the demo on the next push.

---

## How it works

```
┌────────────────┐  push to main   ┌─────────────────┐
│  GitHub (main) │ ──────────────► │ Vercel rebuild  │
└────────────────┘                 │  • Production   │ → reads MONGODB_URI (prod)
                          │        │  • Preview      │ → reads MONGODB_URI (demo)
                          │        └─────────────────┘
                          ▼
                 ┌────────────────────┐
                 │ seed-demo workflow │ → wipes & re-seeds the *demo* DB only
                 └────────────────────┘
```

The demo DB is **only ever touched by the workflow**, never by prod traffic.
The seed script (`scripts/seed-demo.ts`) refuses to run unless its target URI
contains `DEMO_DB_HOST_HINT`, so a misconfigured secret can't wipe production.

---

## One-time setup

### 1. Create the demo Mongo cluster

In MongoDB Atlas, create a new cluster (a free M0 is plenty for demo) — or a
new database in your existing cluster, e.g. `pragati_demo`.

Grab the connection string. It must contain a unique substring you'll set as
the hint — for example:

```
mongodb+srv://demoUser:…@pragati-demo.xxxxx.mongodb.net/pragati_demo
```

Here `demo` (or `pragati-demo`) is a safe hint.

### 2. GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `DEMO_MONGODB_URI` | the connection string from step 1 |
| `DEMO_DB_HOST_HINT` | the substring (e.g. `demo`) |

Optionally add a repository **variable** `SEED_DEMO_ENABLED=true` (under the
same page → **Variables** tab) to enable the workflow before either secret is
set. With the secrets present the workflow runs automatically.

### 3. Vercel preview environment

Project → **Settings → Environment Variables**. For *every* secret your prod
deployment uses (`MONGODB_URI`, `JWT_SECRET`, AI keys, etc.):

- **Production** scope → keep the prod values.
- **Preview** scope → set fresh values:
  - `MONGODB_URI` → the demo URI (same one you put in GitHub).
  - `JWT_SECRET` → a *different* secret than prod (anything random, 32+ chars).
  - `ADMIN_BOOTSTRAP_TOKEN` → leave **unset** (the seed creates the admin).
  - Other secrets → either copy from prod or set demo-specific values.

Vercel automatically gives every Git branch its own Preview URL, so:

- `main` → `pragati-git-main-<org>.vercel.app` (or your custom preview domain)
- a PR branch → its own URL

Both read from the **Preview** env, i.e. the demo DB.

### 4. Push to main

The `seed-demo` workflow will run, wipe the demo DB, and rebuild it with the
dataset from `scripts/seed-demo.ts`. Open the preview URL and sign in with:

| Email | Password | Role |
| --- | --- | --- |
| `demo.admin@pragati.local` | `demo1234` | Admin |
| `priya.shah@pragati.local` | `demo1234` | Team Lead |
| `karan.desai@pragati.local` | `demo1234` | Individual Contributor |

(There are 30 demo users in total — see `scripts/seed-demo.ts` for the full
list. All share the password `demo1234`.)

---

## What's in the demo dataset

- **30 users** across 3 organisations and 6 departments (1 admin + 5 leads + 24 ICs).
- **6 teams** (QA-IT, CSV, Data Integrity, Pharmacovigilance, Operations, MES).
- **14 shared projects** spanning every lifecycle template (Change Control,
  CSV, Deviation, CAPA, SOP, Audit, Agile sprint, Release, Validation, generic),
  each with phases + ~10–20 tasks at mixed statuses.
- **6 personal projects** on different ICs so the personal-toggle UI has
  something to show.
- **A few audit log entries** (a role promotion with reason, an identity
  backfill with diff, a project creation) so the audit page isn't empty.

A re-seed clears these collections only: `users`, `teams`, `projects`,
`tasks`, `auditlogs`, `notifications`. Nothing else in the DB is touched.

---

## Manually re-seeding

You can also trigger the re-seed yourself (GitHub → Actions → **Seed demo
database** → **Run workflow**) or locally:

```bash
MONGODB_URI='mongodb+srv://…demo…' \
DEMO_DB_HOST_HINT='demo' \
JWT_SECRET='whatever' \
npm run seed:demo
```

The local script also refuses to run unless the URI contains the hint.

---

## Safety notes

- The seed script does **not** drop the database — only the six collections
  it knows about. If you accidentally point it at prod, the hint check is
  the first line of defence; the collection list is the second.
- Production has `ADMIN_BOOTSTRAP_TOKEN` set; demo never does. The bootstrap
  page is therefore inaccessible on the demo URL, which is what you want.
- Don't paste real customer emails into the demo. Search-engine indexing is
  still on by default — if that's a concern, add `noindex` headers to the
  preview deployment (Vercel → Settings → Headers).
