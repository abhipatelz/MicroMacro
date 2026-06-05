import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie, isDeactivatedFromCookie, normalizeRole } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import AppShell from '@/components/AppShell';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookie();
  if (!user) {
    if (await isDeactivatedFromCookie()) redirect('/login?reason=deactivated');
    redirect('/login');
  }

  // Fetch only the current user's own avatar/settings — the workspace avatar
  // registry and notification count are fetched client-side by their respective
  // components (AvatarRegistry, NotificationBell) and don't need to block SSR.
  await connectDB();
  const dbUser = await User.findById(user.sub)
    .select('avatarLetter avatarBg avatarFont soundDropEnabled hasSeenTour')
    .lean();

  // Seed only the current user's own avatar so the sidebar self-portrait is
  // correct on first paint. Other users' avatars stream in client-side.
  const initialAvatars: Record<string, { letter: string; bg: string; font: number }> = {};
  if ((dbUser as any)?.avatarBg) {
    initialAvatars[user.sub] = {
      letter: (dbUser as any).avatarLetter || '',
      bg:     (dbUser as any).avatarBg     || '',
      font:   typeof (dbUser as any).avatarFont === 'number' ? (dbUser as any).avatarFont : 0,
    };
  }

  // Read the dark-mode preference server-side so AppShell mounts in the
  // correct theme on first paint. Eliminates the flash-of-light-content
  // that previously appeared on every navigation when the localStorage
  // useEffect kicked in after hydration.
  const initialDark = cookies().get('theme')?.value === 'dark';

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
      initialAvatars={initialAvatars}
    >
      {children}
    </AppShell>
  );
}
