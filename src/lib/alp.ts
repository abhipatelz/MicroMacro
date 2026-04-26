/**
 * Amazon Leadership Principles — embedded as living philosophy throughout Pragati.
 *
 * These are not decorations. They inform how we assign work, measure quality,
 * celebrate wins, and flag risks. Each principle has:
 *   - A short title + tagline
 *   - The original Amazon text (abridged)
 *   - A team lens — what it means for quality-driven project work
 *   - A micro-copy set used across the UI
 */

export interface Principle {
  id: string;
  number: number;
  title: string;
  tagline: string;
  text: string;         // original principle, abridged
  qiLens: string;       // what it means for our work
  verb: string;         // action word for badge labels ("Delivered Results")
  icon: string;
  emptyHint: string;    // copy for empty states
  overdueNudge: string; // copy when a task is overdue
  winPhrase: string;    // shown on celebration card when this principle fired
}

export const PRINCIPLES: Principle[] = [
  {
    id: 'customer_obsession',
    number: 1,
    title: 'Customer Obsession',
    tagline: 'Start with the patient. Work backwards.',
    text: 'Leaders start with the customer and work backwards. They work vigorously to earn and keep customer trust.',
    qiLens: 'The end user of your work — whether a customer, colleague, or stakeholder — is who you are ultimately building for. Every task you close, every decision you make, connects back to them. Keep that in mind when the work feels tedious.',
    verb: 'Patient-first',
    icon: '🫀',
    emptyHint: 'Start with what serves the patient most.',
    overdueNudge: 'A patient is waiting on the other side of this.',
    winPhrase: 'Patient-first — you delivered value that matters.'
  },
  {
    id: 'ownership',
    number: 2,
    title: 'Ownership',
    tagline: 'Act on behalf of the whole company, not just your team.',
    text: 'Leaders are owners. They think long term and never sacrifice long-term value for short-term results.',
    qiLens: 'When you spot a gap outside your project, file it. Own the outcome, not just the task. A missed issue that someone else notices is still a team failure.',
    verb: 'Owned it',
    icon: '🔑',
    emptyHint: "This bucket is yours. Own it — add what's missing.",
    overdueNudge: 'Owners close loops. This one is still open.',
    winPhrase: "Ownership — you saw it through to the end."
  },
  {
    id: 'invent_simplify',
    number: 3,
    title: 'Invent and Simplify',
    tagline: 'Find new ways. Be suspicious of complexity.',
    text: 'Leaders expect and require innovation from their teams and always find ways to simplify.',
    qiLens: 'If a workflow needs a 12-step manual to not break, the workflow is the problem. Every project phase is a chance to simplify — fewer handoffs, clearer criteria, less ambiguity.',
    verb: 'Simplified',
    icon: '⚡',
    emptyHint: 'Simple beats clever. Add the most direct path forward.',
    overdueNudge: 'Is there a simpler path through this task? Find it.',
    winPhrase: 'Invented and simplified — you made the work lighter for everyone.'
  },
  {
    id: 'are_right_a_lot',
    number: 4,
    title: 'Are Right, A Lot',
    tagline: 'Strong judgement. Seek diverse perspectives.',
    text: 'Leaders have strong judgment and good instincts. They seek diverse perspectives and work to disconfirm their beliefs.',
    qiLens: 'In project work, being right matters enormously — bad decisions compound. Build judgement by reviewing past issues and outcomes, not just current ones. Diverse perspectives catch what solo reviewers miss.',
    verb: 'Right call',
    icon: '🎯',
    emptyHint: "Good judgement starts with information. Add what you know.",
    overdueNudge: 'Check your assumptions — is the block you think you have real?',
    winPhrase: 'Right, a lot — your judgement paid off.'
  },
  {
    id: 'learn_curious',
    number: 5,
    title: 'Learn and Be Curious',
    tagline: 'Never stop learning. Explore new possibilities.',
    text: 'Leaders are never done learning and always seek to improve themselves. They are curious about new possibilities and act to explore them.',
    qiLens: 'The tools, standards, and methods your team uses are evolving constantly. Each new system, framework, or process is a chance to learn. Curiosity is a quality mindset: ask why, not just how.',
    verb: 'Kept learning',
    icon: '📚',
    emptyHint: "Nothing to show yet — curious what's possible?",
    overdueNudge: 'Learn something from the delay — what caused it?',
    winPhrase: 'Learn and be curious — you grew through this one.'
  },
  {
    id: 'hire_develop',
    number: 6,
    title: 'Hire and Develop the Best',
    tagline: 'Raise the bar with every hire. Coach relentlessly.',
    text: 'Leaders raise the performance bar with every hire and promotion. They recognise exceptional talent and willingly move them throughout the organisation.',
    qiLens: 'Your team is your force multiplier. When you mentor a colleague, share a template, or take time to explain your thinking, you are developing the best — right in your own team.',
    verb: 'Developed others',
    icon: '🌱',
    emptyHint: 'Great teams build great work. Add a task to help someone grow.',
    overdueNudge: 'Could someone else unblock this task? Developing them is also your job.',
    winPhrase: 'Developed the best — you made the team stronger.'
  },
  {
    id: 'highest_standards',
    number: 7,
    title: 'Insist on the Highest Standards',
    tagline: 'Relentlessly raise the bar. Do not normalise defects.',
    text: 'Leaders have relentlessly high standards — many people may think these standards are unreasonably high. Leaders are continually raising the bar.',
    qiLens: 'Standards are a floor, not a ceiling. When a deliverable is "mostly done", it is not done. Consistency across every task, every review, every handoff is what separates good teams from great ones.',
    verb: 'Held the standard',
    icon: '⭐',
    emptyHint: 'High standards start with a clear list. What needs to be done?',
    overdueNudge: 'High standards include closing loops on time.',
    winPhrase: 'Insist on the Highest Standards — quality delivered.'
  },
  {
    id: 'think_big',
    number: 8,
    title: 'Think Big',
    tagline: 'Think at a different scale. Inspire results.',
    text: 'Thinking small is a self-fulfilling prophecy. Leaders create and communicate a bold direction that inspires results.',
    qiLens: 'Your role is not just keeping the lights on. Every process you automate, every tool you build, every manual step you eliminate — that is thinking big for the team and the people they serve.',
    verb: 'Thought big',
    icon: '🚀',
    emptyHint: 'What would you build if it could not fail?',
    overdueNudge: 'Zoom out — does this blocker matter in the long arc?',
    winPhrase: 'Thought big — your work moved the horizon.'
  },
  {
    id: 'bias_for_action',
    number: 9,
    title: 'Bias for Action',
    tagline: 'Speed matters. Many decisions are reversible.',
    text: 'Speed matters in business. Many decisions and actions are reversible and do not need extensive study. We value calculated risk taking.',
    qiLens: 'In fast-moving project work, "waiting for perfect information" is how blockers accumulate. When you are 70% certain, act and course-correct. Paralysis is the enemy of progress.',
    verb: 'Acted first',
    icon: '⚡',
    emptyHint: 'Done beats perfect. Add and iterate.',
    overdueNudge: 'Bias for action — what is the smallest step you can take right now?',
    winPhrase: 'Bias for Action — you moved when it mattered.'
  },
  {
    id: 'frugality',
    number: 10,
    title: 'Frugality',
    tagline: 'Accomplish more with less.',
    text: 'Accomplish more with less. Constraints breed resourcefulness, self-sufficiency, and invention.',
    qiLens: 'Every team operates within constraints — time, budget, headcount. Constraints are not excuses. They are the pressure that turns coal into diamonds. Build more with less.',
    verb: 'Did more with less',
    icon: '🎁',
    emptyHint: 'Constraints breed creativity. What can you do with what you have?',
    overdueNudge: 'Can you close this with less — fewer approvals, fewer steps?',
    winPhrase: 'Frugality — you achieved more than the resources suggested.'
  },
  {
    id: 'earn_trust',
    number: 11,
    title: 'Earn Trust',
    tagline: 'Be vocally self-critical. Benchmark against the best.',
    text: 'Leaders listen attentively, speak candidly, and treat others respectfully. They are vocally self-critical, even when it is socially awkward to do so.',
    qiLens: 'Team trust is built on earned transparency. When something goes wrong, own it immediately and publicly. The project history does not lie, and neither should we.',
    verb: 'Earned trust',
    icon: '🤝',
    emptyHint: 'Transparency starts here. What is actually happening?',
    overdueNudge: 'Earn trust by flagging this delay proactively, before someone asks.',
    winPhrase: 'Earned Trust — your transparency made the team stronger.'
  },
  {
    id: 'dive_deep',
    number: 12,
    title: 'Dive Deep',
    tagline: 'Stay connected to details. Audit frequently.',
    text: 'Leaders operate at all levels, stay connected to the details, audit frequently, and are sceptical when metrics and anecdote differ.',
    qiLens: 'Root cause analysis is Dive Deep in action. Do not accept surface-level explanations — they are the starting point, not the answer. Subtasks exist to capture the deep work. Use them.',
    verb: 'Dove deep',
    icon: '🔍',
    emptyHint: 'The answer is in the details. Break it down.',
    overdueNudge: 'Dive deep — what is the real blocker here?',
    winPhrase: 'Dove Deep — thorough work that will not come back to haunt you.'
  },
  {
    id: 'backbone',
    number: 13,
    title: 'Have Backbone; Disagree and Commit',
    tagline: 'Challenge decisions respectfully. Commit fully once decided.',
    text: 'Leaders are obligated to respectfully challenge decisions when they disagree, even when doing so is uncomfortable. Once a decision is determined, commit wholly.',
    qiLens: 'If a plan is incomplete, say so during review — not after execution has started. Once a direction is set, commit to it fully. The backbone is in the discussion; the commitment is in the delivery.',
    verb: 'Had backbone',
    icon: '🦴',
    emptyHint: 'Say what you think. Then build what was agreed.',
    overdueNudge: 'Is something blocking this that should have been raised earlier? Say it now.',
    winPhrase: 'Had Backbone — you disagreed, committed, and delivered.'
  },
  {
    id: 'deliver_results',
    number: 14,
    title: 'Deliver Results',
    tagline: 'Focus on key inputs. Deliver with the right quality.',
    text: 'Leaders focus on the key inputs for their business and deliver them with the right quality and in a timely fashion.',
    qiLens: 'Effectiveness checks exist because intentions are not results. Metrics on this dashboard exist because impressions are not results. Close the task.',
    verb: 'Delivered',
    icon: '📦',
    emptyHint: 'Results speak for themselves. Start building.',
    overdueNudge: 'Deliver Results — this task is waiting to be closed.',
    winPhrase: 'Delivered Results — the work is done and it counts.'
  },
  {
    id: 'best_employer',
    number: 15,
    title: "Strive to be Earth's Best Employer",
    tagline: 'Create a safe, productive, diverse environment.',
    text: 'Leaders work every day to create a safer, more productive, higher performing, more diverse, and more just work environment.',
    qiLens: 'A high-performing culture is a safe culture — psychologically as well as operationally. When someone flags a gap without fear of blame, the system works. That safety is built task by task, review by review.',
    verb: 'Built culture',
    icon: '🌍',
    emptyHint: 'A great workplace is built in small acts. What can you do today?',
    overdueNudge: 'Is someone stuck? The best employer unblocks people.',
    winPhrase: "Striving for Earth's Best — you made the team a better place today."
  },
  {
    id: 'broad_responsibility',
    number: 16,
    title: 'Success and Scale Bring Broad Responsibility',
    tagline: 'Humble about impact. Vigilant about consequences.',
    text: 'We must be humble and thoughtful about our impact. Our decisions and actions affect the world in ways large and small.',
    qiLens: 'As your team and tools grow, one wrong assumption propagates to every workflow that depends on them. Scale is responsibility. Build carefully, test thoroughly, and think about downstream impact.',
    verb: 'Responsible at scale',
    icon: '⚖️',
    emptyHint: 'With responsibility comes the obligation to act. What matters most?',
    overdueNudge: 'At scale, delays compound. Close this before it cascades.',
    winPhrase: 'Responsible at Scale — you considered the full impact and delivered.'
  }
];

/** Returns the principle for today, deterministically cycling every 16 days */
export function getTodaysPrinciple(): Principle {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return PRINCIPLES[dayOfYear % PRINCIPLES.length];
}

/** Returns the principle most appropriate for a task completion context */
export function getPrincipleForCompletion(opts: {
  daysEarly?: number;
  isCompliance?: boolean;
  hasSubtasks?: boolean;
  hadComment?: boolean;
}): Principle {
  if (opts.daysEarly && opts.daysEarly >= 2) return getPrinciple('bias_for_action');
  if (opts.isCompliance) return getPrinciple('highest_standards');
  if (opts.hasSubtasks) return getPrinciple('dive_deep');
  if (opts.hadComment) return getPrinciple('earn_trust');
  return getPrinciple('deliver_results');
}

export function getPrinciple(id: string): Principle {
  return PRINCIPLES.find((p) => p.id === id) ?? PRINCIPLES[13]; // default: deliver_results
}
