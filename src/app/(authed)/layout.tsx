import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie, normalizeRole } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Notification } from '@/models/Notification';
import AppShell from '@/components/AppShell';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookie();
  if (!user) redirect('/login');

  // The JWT doesn't carry monogram-avatar fields (they're mutable, the JWT is
  // signed), so pull them off the User document for SSR. Keeps the avatar in
  // the sidebar in sync with the editor without a client-side refetch.
  await connectDB();
  const [dbUser, avatarRows, initialUnread] = await Promise.all([
    User.findById(user.sub)
      .select('avatarLetter avatarBg avatarFont soundDropEnabled hasSeenTour')
      .lean(),
    // Every customised avatar in the workspace, so the registry is fully
    // populated on the first SSR paint — no flash as other users' monograms
    // resolve. Only rows with a custom background count as customised, so the
    // payload stays tiny.
    User.find({ avatarBg: { $nin: [null, ''] } }, '_id avatarLetter avatarBg avatarFont').lean(),
    // Unread notification count, seeded into the bell so the badge is right on
    // first paint instead of popping in after the first client poll.
    Notification.countDocuments({ userId: user.sub, read: false }),
  ]);

  const initialAvatars: Record<string, { letter: string; bg: string; font: number }> = {};
  for (const r of avatarRows as any[]) {
    initialAvatars[String(r._id)] = {
      letter: r.avatarLetter || '',
      bg:     r.avatarBg || '',
      font:   typeof r.avatarFont === 'number' ? r.avatarFont : 0,
    };
  }

  // Read the dark-mode preference server-side so AppShell mounts in the
  // correct theme on first paint. Eliminates the flash-of-light-content
  // that previously appeared on every navigation when the localStorage
  // useEffect kicked in after hydration.
  const initialDark = cookies().get('theme')?.value === 'dark';
  // Sidebar collapse state: cookie-backed so the server knows the initial
  // value and AppShell renders the correct width without a post-hydration
  // layout shift (previously read from localStorage in a useEffect).
  const initialSidebarCollapsed = cookies().get('sidebar_collapsed')?.value === '1';

  return (
    <AppShell
      user={{
        id: user.sub,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        title: user.title || '',
        mustChangePassword: user.mustChangePassword,
        hasPin: user.hasPin,
        loginCount: user.loginCount,
        pinPromptDismissedAt: user.pinPromptDismissedAt,
        avatarLetter: (dbUser as any)?.avatarLetter || '',
        avatarBg:     (dbUser as any)?.avatarBg     || '',
        avatarFont:   (dbUser as any)?.avatarFont   ?? 0,
        soundDropEnabled: (dbUser as any)?.soundDropEnabled !== false,
        hasSeenTour:      (dbUser as any)?.hasSeenTour !== false,
      }}
      initialDark={initialDark}
      initialSidebarCollapsed={initialSidebarCollapsed}
      initialAvatars={initialAvatars}
      initialUnread={initialUnread}
    >
      {children}
    </AppShell>
  );
}
