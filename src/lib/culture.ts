/**
 * Cultural layer — small details that make Pragati feel personal.
 *
 * Greetings are multilingual (English, Hindi, Gujarati) with seasonal awareness.
 * Quality quotes rotate through voices who shaped the field.
 */

export interface CultureGreeting {
  text: string;
  sub: string;
  lang?: string;
}

/** Time-of-day greeting — rotates language by day of week */
export function getGreeting(name: string): CultureGreeting {
  const firstName = name.split(' ')[0];
  const hour = new Date().getHours();
  const dow = new Date().getDay(); // 0=Sun

  // Seasonal check first
  const seasonal = getSeasonalGreeting(firstName);
  if (seasonal) return seasonal;

  // Language rotation: Mon/Thu = Gujarati, Tue/Fri = Hindi, rest = English
  if (dow === 1 || dow === 4) {
    if (hour < 12)
      return { text: `સુ.પ્ર. ${firstName} 🌅`, sub: 'Suprabhaat — good morning', lang: 'gu' };
    if (hour < 17)
      return { text: `કેમ છો, ${firstName}?`, sub: 'Kem chho — how are you?', lang: 'gu' };
    return { text: `${firstName}, ઘણું સરસ 👋`, sub: 'Ghanu saras — very nice to see you', lang: 'gu' };
  }

  if (dow === 2 || dow === 5) {
    if (hour < 12)
      return { text: `सुप्रभात, ${firstName} 🌤️`, sub: 'Suprabhat — good morning', lang: 'hi' };
    if (hour < 17)
      return { text: `नमस्ते, ${firstName} 🙏`, sub: 'Namaste', lang: 'hi' };
    return { text: `${firstName}, बढ़िया 👋`, sub: 'Badhiya — great to see you', lang: 'hi' };
  }

  // Default English
  if (hour < 12) return { text: `Good morning, ${firstName} ☀️`, sub: '' };
  if (hour < 17) return { text: `Good afternoon, ${firstName}`, sub: '' };
  return { text: `Good evening, ${firstName} 🌙`, sub: '' };
}

/** Returns a seasonal greeting if today is near a major Indian festival */
function getSeasonalGreeting(firstName: string): CultureGreeting | null {
  const today = new Date();
  const m = today.getMonth() + 1; // 1-indexed
  const d = today.getDate();

  // Diwali window: late Oct / early Nov (approximate — varies by year)
  if ((m === 10 && d >= 28) || (m === 11 && d <= 5))
    return { text: `Happy Diwali, ${firstName} 🪔`, sub: 'Wishing you light and joy', lang: 'hi' };

  // Navratri: late Sep / Oct
  if ((m === 9 && d >= 28) || (m === 10 && d <= 12))
    return { text: `Jai Mata Di, ${firstName} 🙏`, sub: 'Navratri mubarak', lang: 'hi' };

  // Uttarayan: Jan 14
  if (m === 1 && d === 14)
    return { text: `ઉત્તરાયણ મુબારક, ${firstName} 🪁`, sub: 'Happy Uttarayan — fly high!', lang: 'gu' };

  // Holi window: March
  if (m === 3 && d <= 10)
    return { text: `Happy Holi, ${firstName} 🌈`, sub: 'Bura na maano, Holi hai!', lang: 'hi' };

  // New Year
  if (m === 1 && d === 1)
    return { text: `Happy New Year, ${firstName} 🎆`, sub: 'May all your tasks close on time 😄' };

  return null;
}

/** Micro-copy for progress milestones */
export function getProgressPhrase(pct: number): string {
  if (pct >= 100) return 'Completed ✓';
  if (pct >= 90) return 'Almost done ✓';
  if (pct >= 75) return 'On track';
  if (pct >= 50) return 'Halfway there';
  if (pct >= 25) return 'In progress';
  if (pct > 0) return 'Just started';
  return 'Not started';
}

/** Celebration augment — extra line shown on the pop card */
export function getCelebrationAugment(opts: {
  daysEarly: number;
  isCompliance: boolean;
}): string {
  if (opts.isCompliance && opts.daysEarly > 0)
    return 'Compliance task closed early — Insist on the Highest Standards. 🌟';
  if (opts.isCompliance)
    return 'Compliance-critical task closed. Quality delivered. 🏅';
  if (opts.daysEarly >= 3)
    return `${opts.daysEarly} days early — Bias for Action. ⚡`;
  if (opts.daysEarly === 1 || opts.daysEarly === 2)
    return 'Ahead of schedule — Deliver Results. 📦';
  return 'Progress over perfection. Keep going. 🚀';
}

/** Quality thought leaders — 1 per day */
const QUALITY_QUOTES: Array<{ quote: string; author: string }> = [
  { quote: 'Quality is never an accident; it is always the result of intelligent effort.', author: 'John Ruskin' },
  { quote: 'It is not enough to do your best; you must know what to do, and then do your best.', author: 'W. Edwards Deming' },
  { quote: 'The first step is to measure whatever can be easily measured. This is okay as far as it goes.', author: 'Daniel Yankelovich' },
  { quote: 'Make it work, make it right, make it fast — in that order.', author: 'Kent Beck' },
  { quote: 'There is nothing so useless as doing efficiently that which should not be done at all.', author: 'Peter Drucker' },
  { quote: 'The cost of poor quality is not just in defects. It is in everything that goes wrong because the system was not designed right.', author: 'Joseph Juran' },
  { quote: 'Data integrity is not a process. It is a culture.', author: 'Quality proverb' },
  { quote: 'Quality means doing it right when no one is looking.', author: 'Henry Ford' },
  { quote: 'Errors are not defects. Defects are errors that reach the customer.', author: 'Philip Crosby' },
  { quote: 'In God we trust; all others must bring data.', author: 'W. Edwards Deming' },
  { quote: 'The best time to fix a problem is before it becomes one.', author: 'Quality proverb' },
  { quote: 'If you cannot describe what you are doing as a process, you do not know what you are doing.', author: 'W. Edwards Deming' },
  { quote: 'Perfect is the enemy of good, but good enough is the enemy of quality.', author: 'Voltaire / remix' },
  { quote: 'Findings are gifts — they show you exactly where the system needs to grow.', author: 'Internal wisdom' },
  { quote: 'Great teams do not just complete tasks. They close loops.', author: 'Pragati wisdom' },
  { quote: 'Every process you document is a promise you are making to someone who depends on the outcome.', author: 'Internal wisdom' },
];

export function getTodaysQuote(): { quote: string; author: string } {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return QUALITY_QUOTES[dayOfYear % QUALITY_QUOTES.length];
}
