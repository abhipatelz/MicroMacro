'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { MapPin, Building2, Briefcase, Fingerprint } from 'lucide-react';

/**
 * Shared profile hero — used on both the editable settings page (self) and
 * the read-only public profile at /[username].
 *
 * Design: a layered brand-gradient cover that the glowing brand-ring avatar
 * straddles, then name + role and quiet metadata, with an optional footer
 * strip for links so the whole identity reads as one self-contained unit. One
 * consistent Pragati cover for everyone — deliberately not tinted per person,
 * which read as noisy. Keeping one component means a user's profile looks
 * consistent whether they're editing their own or viewing a colleague's.
 */
const COVER = 'linear-gradient(115deg, #1565C0 0%, #1976D2 38%, #2E7D32 100%)';
const RING = 'conic-gradient(from 210deg, #1565C0, #2E7D32, #1976D2, #1565C0)';
const GLOW = 'rgba(21, 101, 192, 0.32)';
export function ProfileHero({
  name,
  username,
  roleText,
  employeeId,
  title,
  department,
  location,
  organisation,
  avatar,
  avatarExtra,
  actions,
  footer,
  linkUsername = false,
  showMemberId = true,
}: {
  name: string;
  username?: string | null;
  roleText: string;
  employeeId?: string | null;
  title?: string | null;
  department?: string | null;
  location?: string | null;
  organisation?: string | null;
  /** The avatar node (editable button on settings, plain Avatar on public). */
  avatar: ReactNode;
  /** Rendered BELOW the brand ring (e.g. the photo upload/remove links) —
   *  never inside it, so text can't overlap the circle. */
  avatarExtra?: ReactNode;
  /** Right-side action slot over the cover — Edit (self) or Follow (public). */
  actions?: ReactNode;
  /** Optional strip below the identity block — links, share, etc. */
  footer?: ReactNode;
  /** When true, @username links to the public profile route. */
  linkUsername?: boolean;
  /** Member ID is internal — hidden on the public profile view. */
  showMemberId?: boolean;
}) {
  const cover = COVER;
  const ring = RING;
  const glow = GLOW;

  const meta = [
    title ? { icon: Briefcase, text: title } : null,
    department || organisation
      ? { icon: Building2, text: [department, organisation].filter(Boolean).join(' · ') }
      : null,
    location ? { icon: MapPin, text: location } : null,
    showMemberId && employeeId ? { icon: Fingerprint, text: `ID ${employeeId}` } : null,
  ].filter(Boolean) as { icon: any; text: string }[];

  const handle = username ? (
    linkUsername ? (
      <Link
        href={`/${username}`}
        className="font-mono text-[13px] text-slate-400 dark:text-white/40 break-all hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
      >
        @{username}
      </Link>
    ) : (
      <span className="font-mono text-[13px] text-slate-400 dark:text-white/40 break-all">@{username}</span>
    )
  ) : null;

  return (
    <section className="card overflow-hidden p-0">
      {/* Cover — a layered, per-member brand gradient the avatar overlaps.
          A light sweep + fine dot-grid + a soft bottom fade give it depth and
          a crafted, "this is mine" feel without crowding the substance below. */}
      <div className="relative h-28 sm:h-36 overflow-hidden" style={{ background: cover }}>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            opacity: 0.5,
            background: 'radial-gradient(120% 150% at 12% -30%, rgba(255,255,255,0.4), transparent 50%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            opacity: 0.16,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.85) 1px, transparent 1.4px)',
            backgroundSize: '15px 15px',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.14), transparent)' }}
        />
        {actions && <div className="absolute top-3 right-3 flex items-center gap-1.5">{actions}</div>}
      </div>

      <div className="px-5 sm:px-6 pb-5 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
          {/* Brand-ring avatar, lifted to straddle the cover, with a soft glow
              tinted to the member's accent. avatarExtra (photo controls) sits
              centred beneath it — never inside the ring. */}
          <div className="-mt-14 sm:-mt-16 shrink-0 self-start flex flex-col items-center gap-2">
            <div
              className="rounded-full p-[3px] grid place-items-center leading-none"
              style={{ background: ring, boxShadow: `0 12px 30px -8px ${glow}` }}
            >
              <div className="rounded-full p-[3px] bg-white dark:bg-[#262624] grid place-items-center leading-none">
                {avatar}
              </div>
            </div>
            {avatarExtra && <div className="w-full flex justify-center">{avatarExtra}</div>}
          </div>

          <div className="flex-1 min-w-0 sm:pt-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-slate-900 dark:text-white break-words">
                {name}
              </h1>
              <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/55">
                {roleText}
              </span>
            </div>

            {handle && <div className="mt-1">{handle}</div>}

            {meta.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {meta.map((m, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-white/45"
                  >
                    <m.icon size={12} className="text-slate-300 dark:text-white/25 shrink-0" />
                    {m.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {footer && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.06]">{footer}</div>
        )}
      </div>
    </section>
  );
}
