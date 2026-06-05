'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { MapPin, Building2, Briefcase } from 'lucide-react';

/**
 * Shared profile hero — the gradient banner used on both the editable
 * settings page (self) and the read-only public profile at /[username].
 *
 * Keeping one component means a user's profile looks identical whether they're
 * editing their own or viewing a colleague's, and any future polish lands in
 * one place. The avatar is passed in as a node so the settings page can hand
 * over its click-to-edit button while the public view passes a plain Avatar.
 */
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
  actions,
  linkUsername = false,
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
  /** Top-right action slot — Edit (self) or View public profile. */
  actions?: ReactNode;
  /** When true, @username links to the public profile route. */
  linkUsername?: boolean;
}) {
  const meta = [
    title        ? { icon: Briefcase, text: title } : null,
    department   ? { icon: Building2, text: department } : null,
    location     ? { icon: MapPin,    text: location } : null,
  ].filter(Boolean) as { icon: any; text: string }[];

  const handle = username ? (
    linkUsername ? (
      <Link href={`/${username}`} className="font-mono break-all hover:text-white transition-colors">@{username}</Link>
    ) : (
      <span className="font-mono break-all">@{username}</span>
    )
  ) : null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white"
      style={{ boxShadow: '0 16px 48px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.05)' }}
    >
      <div className="absolute inset-0 profile-hero-shimmer" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(120% 140% at 12% 0%, rgba(255,255,255,0.20) 0%, transparent 45%)' }}
      />

      <div className="relative px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="shrink-0 rounded-3xl bg-white p-1.5" style={{ boxShadow: '0 14px 34px rgba(15,23,42,0.22)' }}>
              {avatar}
            </div>
            <div className="min-w-0 pb-1">
              <div className="mb-3 inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white backdrop-blur">
                <span className="font-display">Pragati</span>&nbsp;profile
              </div>
              <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl break-words">{name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
                {handle}
              </div>
              {meta.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {meta.map((m, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
                      <m.icon size={11} className="opacity-80" /> {m.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 lg:min-w-[260px] lg:w-auto">
            <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-white backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/60">Access</div>
              <div className="mt-1 text-sm font-black">{roleText}</div>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-white backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-wider text-white/60">Member ID</div>
              <div className="mt-1 text-sm font-black">{employeeId || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {actions && <div className="absolute top-4 right-4">{actions}</div>}
    </div>
  );
}
