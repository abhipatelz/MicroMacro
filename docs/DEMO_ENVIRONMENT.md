# Demo data

One command. No new environment, no Vercel changes, no Atlas changes. It
drops a ready-to-demo workspace straight into the database your app is
already using and tags every row with `[DEMO]` so you can wipe it again.

## Run it

```bash
MONGODB_URI='<your existing connection string>' npm run seed:demo
```

> If you have a `.env.local` with `MONGODB_URI` set, just `npm run seed:demo`.

Output ends with:

```
  ✓ Demo workspace ready. Sign in with any of these:

      demo.lead@pragati.local  — Team Lead  (best for screen-recordings)
      demo.ic@pragati.local    — Individual Contributor
      …and 13 supporting users (demo.<first>@pragati.local).

      Password (all accounts):  Demo@1234
```

The script is **idempotent** — re-run any time. It deletes only previously
seeded `[DEMO]` records before recreating them, so your real workspace is
never touched.

## What you get

- **15 demo users** across 3 organisations and 6 departments
  (1 demo team-lead, 4 supporting leads, 11 contributors)
- **6 demo teams** (QA-IT, CSV, Data Integrity, Pharmacovigilance, Operations, MES)
- **12 shared projects** spanning every lifecycle template (Change Control,
  CSV, Deviation, CAPA, SOP, Audit, Agile sprint, Release, Validation), each
  with phases + ~10–20 tasks at mixed statuses
- **6 personal projects** on the demo lead/IC so the personal-toggle UI
  has content
- **A few audit-log entries** so the admin's audit page isn't empty

Every team and project is prefixed `[DEMO]` so they're easy to recognise
amid your real data.

## Wipe it

```bash
npm run seed:demo -- --clean
```

Removes every `[DEMO]`-tagged record and demo user. Your real data is left
untouched.

## Trade-off to know about

The workspace admin can see every team and every shared project — that's by
design. So the demo teams/projects **will appear in your admin dashboard**
alongside your real ones, just with `[DEMO]` prefixes. Two ways to keep
your view clean:

1. **Log in as `demo.lead@pragati.local`** instead of the admin when you
   want a "pure demo" view. The demo lead sees only their own teams +
   projects.
2. **Personal projects stay private**. The demo IC and demo lead each get
   a few personal projects — those never appear in any cross-user view.

## Flags

| Flag             | Effect                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| `--clean`        | Wipe demo records, don't recreate                                      |
| `--with-admin`   | Also create `demo.admin@pragati.local` (off by default to avoid double-admin confusion) |

Examples:

```bash
npm run seed:demo                        # rebuild demo data
npm run seed:demo -- --with-admin        # rebuild + include a demo admin
npm run seed:demo -- --clean             # remove demo data
```

## How it stays safe

- Every script-created record carries a marker (`demo.*@pragati.local`
  email pattern, `DEMO-…` project code, `[DEMO]` team/project name).
- The cleanup query only matches those markers — no `deleteMany({})` calls.
- The script aborts immediately if `MONGODB_URI` isn't set.
