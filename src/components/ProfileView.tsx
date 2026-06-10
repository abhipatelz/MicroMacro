'use client';
import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Avatar } from '@/components/ui';
import { ProfileHero } from '@/components/ProfileHero';
import {
  Activity,
  Pencil,
  Github,
  Users,
  UserCheck,
  CheckCircle2,
  CalendarRange,
  FolderKanban,
  Flame,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import { api } from '@/lib/client/api';

// The contribution heatmap is a sizeable, below-the-fold client component —
// lazy-load it so it never blocks first paint of the profile page.
const ActivityGraph = dynamic(() => import('@/components/ActivityGraph').then((m) => m.ActivityGraph), {
  ssr: false,
  loading: () => <div className="h-40 rounded-xl bg-slate-50 animate-pulse" />,
});

/**
 * Read-only public profile, shown at /[username]. Any signed-in member can
 * view any colleague's profile — the workspace directory is open by design
 * (see CLAUDE.md). The hero matches the settings page exactly; only the
 * actions differ: your own profile shows "Edit profile" (→ /settings), a
 * colleague's shows a Follow / Unfollow button.
 */
export default function ProfileView({
  profile,
  isSelf,
}: {
  profile: {
    id: string;
    name: string;
    username?: string | null;
    role: string;
    employeeId?: string | null;
    title?: string | null;
    department?: string | null;
    location?: string | null;
    organisation?: string | null;
    avatarLetter?: string;
    avatarBg?: string;
    avatarFont?: number;
    githubUrl?: string;
    followingCount?: number;
    followerCount?: number;
    viewerIsFollowing?: boolean;
    joinedAt?: string | null;
    stats?: {
      totalDone: number;
      doneThisYear: number;
      projectCount: number;
      streak: number;
    };
  };
  isSelf: boolean;
}) {
  const isLeadOrAdmin = profile.role === 'lead' || profile.role === 'admin';
  const roleText =
    profile.role === 'admin' ? 'Admin' : isLeadOrAdmin ? 'Team Lead' : 'Individual Contributor';

  // Follow / unfollow state — initialised from the server-rendered prop.
  const [following, setFollowing] = useState(!!profile.viewerIsFollowing);
  const [hoveringFollow, setHoveringFollow] = useState(false);
  const [busy, setBusy] = useState(false);
  // Optimistic follower count
  const [followerCount, setFollowerCount] = useState(profile.followerCount ?? 0);

  async function toggleFollow() {
    if (busy) return;
    setBusy(true);
    const wasFollowing = following;
    // Optimistic update
    setFollowing(!wasFollowing);
    setFollowerCount((c) => c + (wasFollowing ? -1 : 1));
    try {
      await api(`/users/${profile.id}/follow`, {
        method: wasFollowing ? 'DELETE' : 'POST',
      });
    } catch {
      // Revert on error
      setFollowing(wasFollowing);
      setFollowerCount((c) => c + (wasFollowing ? 1 : -1));
    } finally {
      setBusy(false);
    }
  }

  const firstName = profile.name.split(/\s+/)[0];

  // Share affordance — the profile URL is the user's public face inside the
  // workspace; copying it should be one click, not an address-bar ritual.
  const [copied, setCopied] = useState(false);
  function copyLink() {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable (http / permissions) — silently skip */
    }
  }

  const joined =
    profile.joinedAt &&
    new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Impact row — server-rendered numbers so the first impression of a profile
  // is what this person delivers, before the heatmap streams in below.
  const stats = profile.stats;
  const statTiles = stats
    ? [
        {
          label: 'Delivered',
          value: stats.totalDone,
          sub: 'tasks all-time',
          icon: CheckCircle2,
          color: '#16a34a',
          bg: '#f0fdf4',
        },
        {
          label: 'This year',
          value: stats.doneThisYear,
          sub: new Date().getFullYear().toString(),
          icon: CalendarRange,
          color: '#1565C0',
          bg: '#eff6ff',
        },
        {
          label: 'Projects',
          value: stats.projectCount,
          sub: 'contributed to',
          icon: FolderKanban,
          color: '#7B1FA2',
          bg: '#f3e5f5',
        },
        {
          label: 'Streak',
          value: stats.streak,
          sub: stats.streak === 1 ? 'active day' : 'active days',
          icon: Flame,
          color: '#d97706',
          bg: '#fffbeb',
        },
      ]
    : [];

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-6">
      <ProfileHero
        name={profile.name}
        username={profile.username}
        roleText={roleText}
        showMemberId={false}
        title={profile.title}
        department={profile.department}
        location={profile.location}
        organisation={profile.organisation}
        avatar={
          <Avatar
            name={profile.name}
            size={88}
            letter={profile.avatarLetter}
            bg={profile.avatarBg}
            font={profile.avatarFont}
          />
        }
        actions={
          isSelf ? (
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/25"
            >
              <Pencil size={12} /> Edit profile
            </Link>
          ) : null
        }
      />

      {/* ── Metadata strip (social counts + joined date + actions) ──────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        {/* Social counts + tenure */}
        <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Users size={14} className="text-slate-400" />
            <span>
              <strong className="font-bold text-slate-700">{followerCount}</strong>{' '}
              {followerCount === 1 ? 'follower' : 'followers'}
            </span>
          </span>
          <span className="text-slate-300">·</span>
          <span className="flex items-center gap-1.5">
            <UserCheck size={14} className="text-slate-400" />
            <span>
              follows <strong className="font-bold text-slate-700">{profile.followingCount ?? 0}</strong>
            </span>
          </span>
          {joined && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400">Joined {joined}</span>
            </>
          )}
        </div>

        {/* Right side: GitHub chip + copy link + Follow button */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {profile.githubUrl && (
            <a
              href={profile.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:border-slate-300"
            >
              <Github size={14} />
              GitHub
            </a>
          )}

          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:border-slate-300"
            title="Copy a link to this profile"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <LinkIcon size={14} />}
            {copied ? 'Copied' : 'Share'}
          </button>

          {!isSelf && (
            <button
              onClick={toggleFollow}
              disabled={busy}
              onMouseEnter={() => setHoveringFollow(true)}
              onMouseLeave={() => setHoveringFollow(false)}
              className={
                following
                  ? hoveringFollow
                    ? 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 px-4 py-1.5 rounded-full text-sm font-semibold transition disabled:opacity-60'
                    : 'border border-green-200 text-green-700 bg-green-50 px-4 py-1.5 rounded-full text-sm font-semibold transition disabled:opacity-60'
                  : 'border border-blue-200 text-blue-600 hover:bg-blue-50 px-4 py-1.5 rounded-full text-sm font-semibold transition disabled:opacity-60'
              }
            >
              {following ? (hoveringFollow ? 'Unfollow' : 'Following ✓') : 'Follow'}
            </button>
          )}
        </div>
      </div>

      {/* ── Impact row — what this person delivers, at a glance ─────────── */}
      {statTiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statTiles.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: s.bg, color: s.color }}
                >
                  <s.icon size={14} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {s.label}
                </span>
              </div>
              <div className="mt-2.5 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                {s.value}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Activity section ────────────────────────────────────────────── */}
      <div id="activity" className="scroll-mt-6">
        <div className="card rounded-xl border overflow-hidden">
          <div className="section-head px-5 py-4 border-b flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 shrink-0">
              <Activity size={18} className="text-blue-500" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-800 leading-tight">Activity</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {isSelf ? 'Your' : `${firstName}'s`} delivered work on Pragati — completed tasks, weighted for
                on-time and priority.
              </p>
            </div>
          </div>
          <div className="px-5 py-5">
            <ActivityGraph userId={profile.id} name={profile.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
