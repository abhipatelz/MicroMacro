/**
 * Pragati release history — the source of truth for the in-app Changelog page.
 *
 * Append a new entry at the TOP of `CHANGELOG` whenever a feature ships,
 * keeping the list in reverse-chronological order. The admin-only
 * /audit/changelog route renders directly off this array, so a code review
 * doubles as the release-notes review.
 *
 * Why a TS module instead of a CMS or markdown file: keeps the changelog
 * versioned alongside the code, gives type-safe references to the entry
 * shape, and ships with the bundle (no runtime fetch, no CDN).
 */

export type ChangelogTag =
  | 'feature' // New capability added
  | 'improvement' // Refinement of existing capability
  | 'fix' // Bug fix
  | 'security' // Security or compliance change
  | 'admin'; // Admin-only / workspace-level change

export interface ChangelogEntry {
  date: string; // ISO date (yyyy-mm-dd)
  title: string; // One-line headline
  body: string[]; // Bullets, plain text
  tags: ChangelogTag[];
  // Optional highlight banner — when set, the entry renders with a colour
  // accent so the visual scanner catches it (e.g. major releases).
  highlight?: boolean;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-06-14',
    title: 'Delivery Foresight — a predictive read on profiles, briefs and teams',
    tags: ['feature', 'improvement'],
    highlight: true,
    body: [
      'Profiles and the daily email now carry Delivery Foresight: a forward-looking, plain-language read on whether your dates will hold — “on pace to clear your plate by ~Jun 20”, or “this task is trending to miss its date — start it today”.',
      'Behind one quiet line sits a real model: log-normal duration fits with empirical-Bayes shrinkage, Holt’s-linear velocity forecasting, an inter-completion-gap throughput model, a seeded Monte-Carlo schedule simulation, and a robust MAD control-chart anomaly detector — fully deterministic and auditable, with no LLM on the path.',
      'Team detail pages get a redesigned hero (function-tinted cover, summary strip) plus a Team Foresight panel — each member’s pace vs. their plate rolled into one capacity read, with the people to look at first floated to the top. Lead/admin only, shared work only.',
      'My Day opens with a Foresight strip — a “start here” pointer at the one task most likely to slip — and the Settings profile now shows the same impact tiles (delivered, this year, projects, streak) as the public profile.',
      'Your own profile and brief get the full forecast (plate-clear date and the single riskiest task); a colleague’s profile shows only your delivery rhythm and reliability, never your current workload.',
      'Retired the profile Highlights (story-style cards) in favour of this — substance over a status update.',
    ],
  },
  {
    date: '2026-05-31',
    title: 'Monogram avatars, personal templates, kanban drop sound',
    tags: ['feature', 'improvement'],
    highlight: true,
    body: [
      'Profile avatars are now Google-style monograms — pick a letter, colour, and font (with an "Inspire me" shuffle). Updates propagate to every surface where the user is shown.',
      'New "Personal" workflow templates (Goal, Study Plan, Habit, Side Project, Event Planner) appear when the Personal-project toggle is on.',
      'Drag-drop interactions on the dashboard and kanban board now play a short audible cue — togglable per user.',
      'Dark-mode contrast fixes on workflow template cards.',
    ],
  },
  {
    date: '2026-05-30',
    title: 'Mobile layout polish + dark-mode activity heatmap',
    tags: ['improvement', 'fix'],
    body: [
      'Dashboard, Projects list and Profile pages tightened for phone-sized viewports — titles no longer truncate to "BOT Automa…", filters stack full-width.',
      'Activity heatmap palette switches with the theme — no more wall of white cells in dark mode.',
    ],
  },
  {
    date: '2026-05-29',
    title: 'Production error monitoring + activity scoring',
    tags: ['admin', 'feature'],
    body: [
      'Admin profile now surfaces a live error monitor for the last 30 days of caught application errors (ErrorLog model, 30-day TTL).',
      'Activity contributions are weighted by on-time delivery, GxP-criticality, priority, and review work — logins no longer count.',
    ],
  },
  {
    date: '2026-05-28',
    title: 'Team report — branded header + CSV export',
    tags: ['feature'],
    body: ['Lead team-report exports to CSV with a branded Pragati header for sharing with management.'],
  },
  {
    date: '2026-05-27',
    title: 'Quick PIN + trusted devices',
    tags: ['security'],
    body: [
      'Devices that completed a full sign-in can now re-unlock with a 4-digit PIN. The first sign-in on any device still requires the full credential, preserving 21 CFR Part 11 §11.10(d) access control.',
    ],
  },
  {
    date: '2026-05-25',
    title: 'GAMP 5 / CSV lifecycle templates',
    tags: ['feature'],
    body: [
      'New project templates for CSV / GAMP 5, SOP Development, Audit, and Validation. Each ships with regulatory references and pre-built phases & tasks.',
    ],
  },
];

// Visual metadata for the tag chips — kept beside the data so the changelog
// page renders without prop drilling.
export const CHANGELOG_TAG_META: Record<ChangelogTag, { label: string; bg: string; text: string }> = {
  feature: {
    label: 'New',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  improvement: {
    label: 'Improved',
    bg: 'bg-blue-50    dark:bg-blue-500/15',
    text: 'text-blue-700    dark:text-blue-300',
  },
  fix: {
    label: 'Fixed',
    bg: 'bg-amber-50   dark:bg-amber-500/15',
    text: 'text-amber-700   dark:text-amber-300',
  },
  security: {
    label: 'Security',
    bg: 'bg-rose-50    dark:bg-rose-500/15',
    text: 'text-rose-700    dark:text-rose-300',
  },
  admin: {
    label: 'Admin',
    bg: 'bg-violet-50  dark:bg-violet-500/15',
    text: 'text-violet-700  dark:text-violet-300',
  },
};
