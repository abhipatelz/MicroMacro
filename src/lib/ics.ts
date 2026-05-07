/**
 * Minimal RFC 5545 (iCalendar) generator — zero deps, open standard.
 * Output works in Outlook, Google Calendar, Apple Calendar, etc.
 */

export interface ICSEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  end: Date;
  organizer?: { name?: string; email: string };
  attendees?: Array<{ name?: string; email: string }>;
}

const CRLF = '\r\n';

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

/** Format as YYYYMMDDTHHMMSSZ (UTC) — most compatible with Outlook/M365. */
function fmtUTC(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** RFC 5545 line folding + escape. Backslashes, commas, semicolons, newlines. */
function escapeICS(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Lines longer than 75 octets MUST be folded onto continuation lines. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    out.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) out.push(' ' + rest);
  return out.join(CRLF);
}

export function buildICS(events: ICSEvent[], opts?: { calName?: string; prodId?: string }): string {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Pragati//${opts?.prodId || 'Project Intelligence'}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (opts?.calName) lines.push(`X-WR-CALNAME:${escapeICS(opts.calName)}`);

  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${fmtUTC(now)}`);
    lines.push(`DTSTART:${fmtUTC(e.start)}`);
    lines.push(`DTEND:${fmtUTC(e.end)}`);
    lines.push(`SUMMARY:${escapeICS(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
    if (e.location)    lines.push(`LOCATION:${escapeICS(e.location)}`);
    if (e.url)         lines.push(`URL:${e.url}`);
    if (e.organizer)   lines.push(`ORGANIZER;CN=${escapeICS(e.organizer.name || e.organizer.email)}:mailto:${e.organizer.email}`);
    for (const a of e.attendees || []) {
      lines.push(
        `ATTENDEE;CN=${escapeICS(a.name || a.email)};RSVP=TRUE:mailto:${a.email}`
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  return lines.map(fold).join(CRLF) + CRLF;
}

export function icsResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
