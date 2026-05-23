# End-to-end tests

Playwright drives the real app (with a real Next.js dev server and a real
MongoDB) through the team-lead's critical flows. The suite was added before
the day-one rollout to a 35-person team — run it before any release.

## Quick start

```bash
# One-time browser install (~150 MB)
npx playwright install chromium

# Run the suite — boots its own dev server on port 3100
npm run e2e

# Watch the tests run in a real browser
npm run e2e:headed

# Interactive trace explorer (best for debugging failures)
npm run e2e:ui

# Open the last HTML report
npm run e2e:report
```

## Database

The Playwright config picks the cheapest available database, in priority order:

1. **`MONGODB_URI` set in your shell** — the suite reuses your environment's
   Mongo (Atlas, docker, whatever). Recommended for CI.
2. **Fallback: in-memory MongoDB** via `mongodb-memory-server`. First run
   downloads a mongod binary (~80 MB). Subsequent runs are offline.

> ⚠ If you're on a network that blocks `fastdl.mongodb.org`, set
> `MONGODB_URI` to a real instance before running.

The suite never writes to the dev or prod database — it bootstraps a fresh
test lead via `/api/auth/register` against whichever DB the config picked.

## What's covered

| File | Critical flows |
| --- | --- |
| `e2e/01-auth.spec.ts` | login renders, forgot-password reachable, invalid creds error, happy-path login, logout |
| `e2e/02-dashboard.spec.ts` | greeting + summary chips + three panels render; "Until…" date picker is **not clipped** by the Actions box; sidebar links don't 404 |
| `e2e/03-projects.spec.ts` | projects list, create a project, switch to Kanban, slider container present, bogus id doesn't 500 |
| `e2e/04-teams.spec.ts` | teams page renders, "membership = tag" helper visible on team detail, `+ Add member` button |
| `e2e/05-ux.spec.ts` | dark-mode toggle flips `<html class="dark">`, favicon is the new SVG, tour does NOT reappear after acknowledgement |

Tests run twice — once on a 1440×900 desktop viewport, once on a Pixel 7
mobile viewport — so layout regressions caught in either form factor.

## When something fails

```bash
npm run e2e:report
```

opens `playwright-report/` which contains traces, screenshots, and video for
every failure. Click any failed test to step through the timeline.

## Adding new tests

Follow `e2e/01-auth.spec.ts` as the template. Each suite calls
`ensureBootstrapLead()` in `test.beforeAll` so it's safe to run in isolation.
