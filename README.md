# Pragati

> Project intelligence for QA-IT team leads. A bird's-eye view of your work, minus the noise.

## What it is

A lightweight project + task tracker built for QA-IT teams in pharma.
Three roles, invite-only — no public sign-ups, no marketing pages:

- **Contributor** — works the tasks assigned to them; private My Day + personal projects.
- **Team Lead** — creates teams, projects and tasks; assigns work; tracks progress.
- **Admin** — full workspace control, user management, operations/audit log.

## Run locally

```bash
cp .env.example .env.local      # set MONGODB_URI, JWT_SECRET
npm install
npm run dev                     # http://localhost:3000
```

For an isolated dev DB without Atlas:

```bash
USE_IN_MEMORY_MONGO=true npm run dev
```

## Production

See [`docs/LAUNCH_CHECKLIST.md`](./docs/LAUNCH_CHECKLIST.md) — top-to-
bottom runbook (env vars, smoke test, uptime monitor, rollback).

## Stack

Next.js 14 (App Router) · TypeScript · MongoDB / Mongoose · Tailwind ·
JWT + bcrypt + httpOnly cookie. No NextAuth, no Prisma, no third-party
identity provider — by design, for 21 CFR Part 11 traceability.

## Architectural invariants

The constraints in [`CLAUDE.md`](./CLAUDE.md) are not suggestions. The
QA triage engine is rule-based (not an LLM), the auth path is hand-
rolled, and persistence is Mongoose-only. Don't relax those without
talking to the QA lead first.

## Scripts

```bash
npm run dev              # local dev server
npm run build            # production build
npm run typecheck        # tsc --noEmit
npm run e2e              # Playwright suite
npm run smoke-prod <url> # read-only smoke test against a live deployment
npm run set-admin <email>      # promote a user to admin
npm run set-password <email> <pw>  # bootstrap a password from CLI
npm run cleanup-users    # drop everyone not from the invite flow
```

## License

Private. Internal QA-IT use only.
