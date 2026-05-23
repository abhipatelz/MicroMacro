# Pre-launch checklist — Pragati v1.0

Run through this list the morning of the rollout. It only takes ~15 minutes
and catches the failure modes that would embarrass us in front of 35 people.

## 1. Environment

In your production hosting dashboard (Vercel / Render / wherever), confirm
**every one** of these is set:

| Variable | Why it matters | If missing |
| --- | --- | --- |
| `MONGODB_URI` | The database | App crashes on first request |
| `JWT_SECRET` | Signs auth cookies | App boots with insecure dev fallback and logs a `[SECURITY]` warning every cold start |
| `APP_URL` | Goes into reset-password links | Reset emails contain `http://localhost:3000` links — broken from the user's inbox |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Sends password-reset email | Forgot-password page now shows a clear *"not set up"* banner instead of pretending it worked. Still: users will not be able to reset their password. |
| `SMTP_FROM`, `SMTP_FROM_NAME` *(optional)* | Friendly sender on the reset email | Defaults to `SMTP_USER` |
| `PM_EMAILS` *(optional)* | Comma-separated emails that auto-promote to lead role on registration | Without this the very first registrant becomes the lead anyway |

Confirmed in your env: ☐

## 2. Build + typecheck

```bash
npm run typecheck   # must exit 0
npm run build       # must exit 0
```

Confirmed: ☐

## 3. E2E suite

```bash
npm run e2e
```

All five spec files green on both desktop and mobile projects. See
[`docs/E2E.md`](./E2E.md) if any fail.

Confirmed: ☐

## 4. Manual smoke (5 minutes, in production)

Sign in to production with **your own admin account** and walk through:

- ☐ Login page shows the new gradient Pragati mark, *not* the old logo image
- ☐ Browser tab favicon is the new Pragati mark (hard-refresh once to clear cache)
- ☐ Dashboard greeting + four summary chips render in the right colours
- ☐ One project in the Projects column expands and shows its task table
- ☐ Actions panel → click *Until…* → calendar pops up **fully visible**,
  not cropped by the Actions box edge
- ☐ Open one project → switch to **Kanban** → arrow buttons appear on
  the sides if there are columns to scroll past
- ☐ Open Settings → toggle **Dark mode** → page recolours to the warm
  Claude-style palette
- ☐ Open a team → see *"Membership is the tag — no separate permissions needed"*
  helper above the member list
- ☐ Click **+ Add member**, add a contributor (employee) to the team
- ☐ Log out, log in as **that contributor**:
   - ☐ They land on a dashboard (no 500)
   - ☐ They see the team's project in the projects column
   - ☐ The *+ New project* / *+ New task* buttons either are hidden or
     return a polite error (server returns 403)
- ☐ Forgot-password flow: enter an email, see the *check your email* page
  (you should also receive the reset mail — if not, recheck SMTP env)

## 5. Day-one operational notes

- The **onboarding tour** fires automatically the first time a fresh lead
  signs in, and never returns after they dismiss it. Tell your team this in
  advance so they don't think it's a glitch.
- Dark mode toggle lives in the profile popover (sidebar footer → click
  the user row).
- Adding someone to a team in `/teams/[id]` is the only thing a lead needs
  to do to give that person visibility into all of the team's projects.
  There is no separate "permissions" tab — that's intentional.

## 6. Rollback

If a regression slips in:

```bash
git log --oneline -10               # find the last good commit
git revert <bad-sha>                # revert + push
# Vercel/Render will redeploy automatically
```

The branch is `claude/analyze-pragati-app-JZ6vv`. Every commit on it has a
descriptive message so reverts are surgical.
