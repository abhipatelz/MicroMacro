/**
 * Personal agenda → iCalendar (RFC 5545) — the pull-based, zero-cost channel.
 * Calendar clients (Outlook, Google, Apple) poll the tokened feed themselves;
 * we never send anything, so this scales for free by definition.
 *
 * Pure functions only — unit-testable without a database.
 */

export interface IcsTask {
  id: string;
  title: string;
  projectName?: string | null;
  /** Effective due date (ccTcd || dueDate), already resolved by the caller. */
  due: Date;
  status?: string;
  priority?: string | null;
  /** When the task last changed — drives SEQUENCE/LAST-MODIFIED so calendar
   *  clients (Outlook especially) actually update a moved event instead of
   *  keeping the stale date. */
  updatedAt?: Date | null;
}

// SEQUENCE must be a monotonically increasing integer per UID. Seconds since
// this epoch keep it well inside the 32-bit range every client accepts.
const SEQUENCE_EPOCH = Date.UTC(2020, 0, 1);
function icsSequence(updatedAt?: Date | null): number {
  if (!updatedAt) return 0;
  return Math.max(0, Math.floor((updatedAt.getTime() - SEQUENCE_EPOCH) / 1000));
}

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function icsStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Fold long content lines at 75 octets per RFC 5545 §3.1. */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

/** Render a user's open tasks as all-day VEVENTs on their effective due date. */
export function renderAgendaIcs(input: {
  calendarName: string;
  tasks: IcsTask[];
  appUrl?: string;
  now?: Date;
}): string {
  const now = input.now || new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pragati//Daily Agenda//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
    'X-WR-CALDESC:Your Pragati tasks by due date — a live feed that updates itself.',
    // Refresh hints: clients that honour these re-poll hourly, so a date
    // change in Pragati lands in the subscriber's calendar within the hour.
    // (Outlook/Google also poll on their own schedule regardless.)
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  for (const t of input.tasks) {
    const dayAfter = new Date(t.due.getTime() + 24 * 60 * 60 * 1000);
    const summary = `${t.title}${t.projectName ? ` · ${t.projectName}` : ''}`;
    const descParts = [
      t.status ? `Status: ${String(t.status).replace(/_/g, ' ')}` : '',
      t.priority ? `Priority: ${t.priority}` : '',
      input.appUrl ? `${input.appUrl}/tasks/${t.id}` : '',
    ].filter(Boolean);
    // Update semantics: the UID is stable per task, so a reschedule must bump
    // SEQUENCE (RFC 5545 §3.8.7.4) for clients to replace the old occurrence
    // instead of showing a duplicate. Minutes-since-epoch of the last mutation
    // is monotonic per change and needs no stored counter.
    const updated = t.updatedAt || now;
    const seq = Math.max(0, Math.floor(+updated / 60000) - 28_000_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${t.id}@pragati`,
      `DTSTAMP:${icsStamp(now)}`,
      // SEQUENCE + LAST-MODIFIED bump whenever the task changes, so a client
      // that already imported this UID re-reads the new DTSTART.
      `SEQUENCE:${icsSequence(t.updatedAt)}`,
      `LAST-MODIFIED:${icsStamp(t.updatedAt || now)}`,
      `DTSTART;VALUE=DATE:${icsDate(t.due)}`,
      `DTEND;VALUE=DATE:${icsDate(dayAfter)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      ...(descParts.length ? [`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`] : []),
      ...(input.appUrl ? [`URL:${input.appUrl}/tasks/${t.id}`] : []),
      'TRANSP:TRANSPARENT', // tasks block no calendar time — they're markers
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
