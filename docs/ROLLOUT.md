# Pragati — team-lead rollout playbook

How to put Pragati into every team lead's hands without a training day.
Designed for a workspace of ~35 leads; one MES lead is already on it
end-to-end, so the playbook below is what they actually did, distilled.

## Week 0 — the day before they hear about it

You (admin):

1. Confirm the launch checklist (`docs/LAUNCH_CHECKLIST.md`) is green.
2. For every new lead you plan to invite, pre-create their team in
   `/teams` so the workspace looks lived-in on day one — empty
   sidebars feel like a beta.
3. Pre-create the **MES** team's projects so other leads see what
   "good" looks like when they open their own teams.

## Day 1 — onboarding a lead, in 4 minutes

For each lead, in order, in **People → + Add lead**:

1. Type their name + work email → generates a temp `Pragati-XXXX`
   password. The modal shows the password once — copy it.
2. Share over chat (not email): "Sign in at pragatialm.vercel.app,
   you'll be asked to set a real password on first login."
3. They sign in. The onboarding tour fires once, then never again.

The lead now has admin-of-their-own-team scope: they can create their
team, add team members, create projects, and assign tasks.

## What a lead does in their first hour

This is the script we used with the MES lead. Have them do it in
this order; each step takes 30 - 90 seconds.

| # | They do | Why |
|---|---|---|
| 1 | Open **Team** in the sidebar. Click **+ Add team** if they don't already have one. | Without a team, no project rolls up to them. |
| 2 | On their team page, click **+ Add member**. Add every person on their team — either pick from existing names, or click **+ New contributor** to create a profile (name + title only; no login). | These names become the assignee dropdown for every task they'll create. |
| 3 | Open **Projects** → **+ New project**. Set name, code, lifecycle. Assign it to their team via the team selector. | Project visibility = team membership. |
| 4 | Open the new project. Use **+ Add task** to seed 5–10 known tasks. Pick assignees from the team-scoped list. | Day-one dashboard isn't empty. |
| 5 | Back to **Dashboard**. They should see "1 ongoing project · N open tasks · M overdue · K team". This is the view their manager will see. | The dashboard is the promise of the tool; it has to look populated. |

## What we tell leads explicitly

- **Forgot your password?** Message the admin (you). Reset takes one
  click on the People page; you'll send a new `Pragati-XXXX`.
- **Locked out after 5 wrong attempts?** Same — message the admin.
  Unlock is one click. The admin doesn't see your real password and
  doesn't need to.
- **Your team members don't need accounts.** Add them as contributors;
  they show up in assignee dropdowns and on every task you assign,
  but they can't sign in. No invites to manage, no extra licences.
- **Effort tracking lives behind a disclosure** on the task page.
  Open it when you need to log time; leave it shut the rest of the
  time. The day-to-day workflow is title + assignee + status + due.
- **Archiving** preserves the project and every task, including
  effort history. Restore from the **Archived** tab on Projects.
  Nothing is lost.

## Day 2-5 — what to watch

You (admin), from the People page:

- Anyone with a **Locked** pill = was guessing their password. Click
  Unlock, ping them to confirm they need a reset.
- Anyone with **0 projects + 0 tasks** = stalled onboarding. Reach out.
- Run `npm run smoke-prod https://pragatialm.vercel.app` once a day
  for the first week. If it fails, you see it before the team does.

## Week 2 and beyond

- Watch Speed Insights. If RES on `/` drops below 80, that's the
  signal to schedule the AppShell server-split (listed in section 8
  of `LAUNCH_CHECKLIST.md`).
- Add Sentry. Errors today land in Vercel logs only.
- Move `rateLimit.ts` to Upstash Redis once you have multi-region.

## When something is on fire

```bash
git fetch origin main
git log --oneline -10 origin/main      # find last known-good SHA
git revert <bad-sha>
git push origin main                   # Vercel auto-redeploys
npm run smoke-prod https://pragatialm.vercel.app
```

For data damage, restore from the most recent Atlas daily snapshot.

That's it. Keep the surface small.
