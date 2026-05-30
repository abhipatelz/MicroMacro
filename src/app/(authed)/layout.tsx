import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import AppShell from '@/components/AppShell';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookie();
  if (!user) redirect('/login');

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
        role: user.role,
        title: user.title || '',
        mustChangePassword: user.mustChangePassword,
        hasPin: user.hasPin,
      }}
      initialDark={initialDark}
    >
      {children}
    </AppShell>
  );
}
