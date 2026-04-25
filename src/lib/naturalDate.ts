/**
 * Natural language date + priority parser for QuickAdd.
 * Zero dependencies — pure Date arithmetic.
 *
 * Understands:
 *   "review IDP docs by friday"         → title clean, due = next Friday
 *   "urgent: fix login bug tomorrow"    → priority = high, due = tomorrow
 *   "submit report in 3 days"           → due = 3 days from now
 *   "close CAPA next week"              → due = next Monday
 *   "finish validation by end of month" → due = last day of current month
 *   "#critical fix null pointer"        → priority = critical
 */

export interface ParsedInput {
  title: string;
  dueDate: string | null;   // ISO date string YYYY-MM-DD or null
  priority: 'low' | 'medium' | 'high' | 'critical' | null;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function nextWeekday(dayIndex: number): Date {
  const now = new Date();
  const today = now.getDay();
  let diff = dayIndex - today;
  if (diff <= 0) diff += 7;
  const d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function endOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function endOfWeek(): Date {
  return nextWeekday(5); // Friday
}

export function parseNaturalInput(raw: string): ParsedInput {
  let text = raw.trim();
  let dueDate: string | null = null;
  let priority: ParsedInput['priority'] = null;

  // ── Priority extraction ────────────────────────────────────────────────────
  // #critical, #high, #low at any position
  text = text.replace(/#(critical|high|medium|low)\b/gi, (_, p) => {
    priority = p.toLowerCase() as ParsedInput['priority'];
    return '';
  });

  // Leading keywords: "urgent:", "asap", "critical:"
  text = text.replace(/^(urgent|asap|critical|important)\s*[:\-]?\s*/i, (_, kw) => {
    const k = kw.toLowerCase();
    priority = k === 'critical' ? 'critical' : 'high';
    return '';
  });

  // ── Date extraction ────────────────────────────────────────────────────────
  // Order matters — more specific patterns first

  // "in N days/weeks"
  text = text.replace(/\bin\s+(\d+)\s+(day|days)\b/i, (_, n) => {
    dueDate = toISO(addDays(parseInt(n)));
    return '';
  });
  text = text.replace(/\bin\s+(\d+)\s+(week|weeks)\b/i, (_, n) => {
    dueDate = toISO(addDays(parseInt(n) * 7));
    return '';
  });

  // "next monday/tuesday/…"
  for (let i = 0; i < DAY_NAMES.length; i++) {
    const pattern = new RegExp(`\\b(next\\s+)?${DAY_NAMES[i]}\\b`, 'i');
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      dueDate = toISO(nextWeekday(i));
      break;
    }
  }

  // "tomorrow"
  if (!dueDate) {
    text = text.replace(/\btomorrow\b/i, () => {
      dueDate = toISO(addDays(1));
      return '';
    });
  }

  // "today"
  if (!dueDate) {
    text = text.replace(/\btoday\b/i, () => {
      dueDate = toISO(new Date());
      return '';
    });
  }

  // "end of month", "eom", "month end"
  if (!dueDate) {
    text = text.replace(/\b(end\s+of\s+month|eom|month\s+end)\b/i, () => {
      dueDate = toISO(endOfMonth());
      return '';
    });
  }

  // "end of week", "eow", "this friday"
  if (!dueDate) {
    text = text.replace(/\b(end\s+of\s+week|eow|this\s+friday)\b/i, () => {
      dueDate = toISO(endOfWeek());
      return '';
    });
  }

  // "next week"
  if (!dueDate) {
    text = text.replace(/\bnext\s+week\b/i, () => {
      dueDate = toISO(addDays(7));
      return '';
    });
  }

  // Strip leading prepositions left behind: "by", "before", "due"
  text = text.replace(/\b(by|before|due|on|for)\s*$/i, '').trim();
  text = text.replace(/\s{2,}/g, ' ').trim();

  return { title: text, dueDate, priority };
}
