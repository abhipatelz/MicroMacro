/**
 * The user-facing project reference number.
 *
 * Every project has a system-generated `code` (e.g. "SOP-2026-0004") and a
 * user-editable change-control number `ccNo`. Once a member sets/changes the
 * reference, that is what they expect to see — so this is the single source of
 * truth for "the reference to display" across the whole app and the email
 * digest: the picked `ccNo` when present, otherwise the system code.
 *
 * (`ccNo` defaults to `code` at creation, so this is identical until the user
 * actually changes it — at which point everything that calls this updates.)
 */
export function projectRef(p?: { ccNo?: string | null; code?: string | null } | null): string {
  if (!p) return '';
  const cc = (p.ccNo || '').trim();
  return cc || p.code || '';
}
