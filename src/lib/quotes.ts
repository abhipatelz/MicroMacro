/**
 * Login-screen wisdom — drawn from a fixed canon of books on building and
 * leading: High Output Management, Only the Paranoid Survive, The Hard Thing
 * About Hard Things, The Innovator's Dilemma, Outliers, The Singularity Is
 * Near, Snow Crash, and Positioning — plus Jensen Huang's own lines.
 *
 * Display rule: NO attribution is ever rendered. The words stand alone.
 * (`author` is kept on the type for internal curation and feed validation
 * only — the login page never shows it.)
 *
 * No-repeat rule: the login page rotates through a per-device shuffled queue
 * and never repeats a quote until the whole library is exhausted. At one
 * quote per 8 seconds across 40+ quotes, that guarantees no repetition for
 * well over five minutes of reading.
 *
 * The library can still be refreshed forever without a redeploy by hosting a
 * JSON array of {text, author} and setting QUOTES_FEED_URL — /api/quotes
 * serves the feed with this list as permanent fallback.
 */

export interface Quote {
  text: string;
  author: string; // internal curation key only — never rendered
}

export const BUILTIN_QUOTES: Quote[] = [
  // ── High Output Management ──────────────────────────────────────────────
  {
    text: 'A manager’s output is the output of his organization plus the output of the neighboring organizations under his influence.',
    author: 'High Output Management',
  },
  {
    text: 'The art of management lies in selecting the one, two, or three activities that provide leverage well beyond the others — and concentrating on them.',
    author: 'High Output Management',
  },
  {
    text: 'Stressing output is the key to improving productivity; looking to increase activity can result in just the opposite.',
    author: 'High Output Management',
  },
  {
    text: 'How you handle your own time is the single most important aspect of being a role model and leader.',
    author: 'High Output Management',
  },
  {
    text: 'Training is, quite simply, one of the highest-leverage activities a manager can perform.',
    author: 'High Output Management',
  },
  {
    text: 'A genuinely effective indicator covers the output of the work, not simply the activity involved.',
    author: 'High Output Management',
  },
  {
    text: 'Reports are more a medium of self-discipline than a way to communicate information.',
    author: 'High Output Management',
  },
  {
    text: 'When a person is not doing his job, there can only be two reasons: he either can’t do it, or won’t.',
    author: 'High Output Management',
  },
  // ── Only the Paranoid Survive ───────────────────────────────────────────
  {
    text: 'Success breeds complacency. Complacency breeds failure. Only the paranoid survive.',
    author: 'Only the Paranoid Survive',
  },
  {
    text: 'A strategic inflection point is when the fundamentals of a business are about to change.',
    author: 'Only the Paranoid Survive',
  },
  {
    text: 'Bad companies are destroyed by crisis. Good companies survive them. Great companies are improved by them.',
    author: 'Only the Paranoid Survive',
  },
  { text: 'Let chaos reign, then rein in chaos.', author: 'Only the Paranoid Survive' },
  {
    text: 'The person who is the star of a previous era is often the last one to adapt to change.',
    author: 'Only the Paranoid Survive',
  },
  // ── The Hard Thing About Hard Things ────────────────────────────────────
  {
    text: 'Hard things are hard because there are no easy answers or recipes.',
    author: 'The Hard Thing About Hard Things',
  },
  {
    text: 'Take care of the people, the products, and the profits — in that order.',
    author: 'The Hard Thing About Hard Things',
  },
  {
    text: 'Every time you make the hard, correct decision you become a bit more courageous; every time you make the easy, wrong decision you become a bit more cowardly.',
    author: 'The Hard Thing About Hard Things',
  },
  {
    text: 'Spend zero time on what you could have done, and devote all of your time on what you might do.',
    author: 'The Hard Thing About Hard Things',
  },
  {
    text: 'There are no shortcuts to knowledge, especially knowledge gained from personal experience.',
    author: 'The Hard Thing About Hard Things',
  },
  {
    text: 'Build a culture that rewards people for getting problems into the open, where they can be solved.',
    author: 'The Hard Thing About Hard Things',
  },
  {
    text: 'Sometimes an organization doesn’t need a solution; it just needs clarity.',
    author: 'The Hard Thing About Hard Things',
  },
  // ── The Innovator's Dilemma ─────────────────────────────────────────────
  { text: 'Markets that do not exist cannot be analyzed.', author: "The Innovator's Dilemma" },
  {
    text: 'The very decision-making processes that are key to the success of established companies are the same processes that reject disruptive ideas.',
    author: "The Innovator's Dilemma",
  },
  {
    text: 'Disruption starts simpler and cheaper at the low end — and then it climbs.',
    author: "The Innovator's Dilemma",
  },
  {
    text: 'Listening only to your best customers can be precisely how you lose the future.',
    author: "The Innovator's Dilemma",
  },
  // ── Outliers ────────────────────────────────────────────────────────────
  {
    text: 'Practice isn’t the thing you do once you’re good. It’s the thing you do that makes you good.',
    author: 'Outliers',
  },
  {
    text: 'Success arises out of a predictable and powerful set of circumstances and opportunities — and the readiness to seize them.',
    author: 'Outliers',
  },
  {
    text: 'Hard work is a prison sentence only if it does not have meaning.',
    author: 'Outliers',
  },
  {
    text: 'Autonomy, complexity, and a connection between effort and reward — the three qualities work must have to be satisfying.',
    author: 'Outliers',
  },
  {
    text: 'No one who rises before dawn three hundred sixty days a year fails to make his family rich.',
    author: 'Outliers',
  },
  // ── The Singularity Is Near ─────────────────────────────────────────────
  {
    text: 'We won’t experience a hundred years of progress in this century — it will be more like twenty thousand years of progress, at today’s rate.',
    author: 'The Singularity Is Near',
  },
  {
    text: 'Our intuition about the future is linear. The reality of technology is exponential.',
    author: 'The Singularity Is Near',
  },
  {
    text: 'An invention has to make sense in the world in which it is finished, not the world in which it is started.',
    author: 'The Singularity Is Near',
  },
  // ── Snow Crash ──────────────────────────────────────────────────────────
  {
    text: 'The world is full of power and energy, and a person can go far by just skimming off a tiny bit of it.',
    author: 'Snow Crash',
  },
  { text: 'Condense fact from the vapor of nuance.', author: 'Snow Crash' },
  // ── Positioning ─────────────────────────────────────────────────────────
  {
    text: 'Positioning is not what you do to a product. It is what you do to the mind.',
    author: 'Positioning',
  },
  { text: 'It is better to be first than it is to be better.', author: 'Positioning' },
  {
    text: 'The mind screens and rejects much of the information offered it. It accepts only what matches its prior state.',
    author: 'Positioning',
  },
  {
    text: 'Don’t try to create something new and different in the mind. Work with what’s already there.',
    author: 'Positioning',
  },
  // ── Jensen Huang ────────────────────────────────────────────────────────
  { text: 'I want you to be in a state of urgency. Not panic — urgency.', author: 'Jensen Huang' },
  { text: 'Run. Don’t walk.', author: 'Jensen Huang' },
  { text: 'The mission is the boss.', author: 'Jensen Huang' },
  {
    text: 'I don’t wear a watch, because the most important time is now.',
    author: 'Jensen Huang',
  },
  {
    text: 'Greatness is not intelligence. Greatness comes from character — and character is formed through struggle.',
    author: 'Jensen Huang',
  },
];

/** Deterministic daily starting point so everyone who opens the login page on
 *  the same day begins on the same quote (then rotation takes over). */
export function dailyQuoteOffset(count: number, now: Date = new Date()): number {
  if (count <= 0) return 0;
  const day = Math.floor(now.getTime() / 86_400_000);
  return day % count;
}
