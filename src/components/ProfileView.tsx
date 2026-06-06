'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Avatar } from '@/components/ui';
import { ProfileHero } from '@/components/ProfileHero';
import { Activity, Pencil } from 'lucide-react';

// The contribution heatmap is a sizeable, below-the-fold client component —
// lazy-load it so it never blocks first paint of the profile page.
const ActivityGraph = dynamic(
  () => import('@/components/ActivityGraph').then(m => m.ActivityGraph),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-slate-50 animate-pulse" /> },
);

/**
 * Read-only public profile, shown at /[username]. Any signed-in member can
 * view any colleague's profile — the workspace directory is open by design
 * (see CLAUDE.md). The hero matches the settings page exactly; only the
 * actions differ: your own profile shows "Edit profile" (→ /settings), a
 * colleague's shows nothing actionable.
 */
export default function ProfileView({ profile, isSelf }: {
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
  };
  isSelf: boolean;
}) {
  const isLeadOrAdmin = profile.role === 'lead' || profile.role === 'admin';
  const roleText = profile.role === 'admin' ? 'Admin' : isLeadOrAdmin ? 'Team Lead' : 'Individual Contributor';

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

      <div id="activity" className="scroll-mt-6">
        <div className="card rounded-xl border overflow-hidden">
          <div className="section-head px-5 py-3.5 border-b flex items-center gap-2.5">
            <Activity size={15} className="text-blue-500 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Activity</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {isSelf ? 'Your' : `${profile.name.split(/\s+/)[0]}'s`} delivered work on Pragati — completed tasks, weighted for on-time and priority.
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
