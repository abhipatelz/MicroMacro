import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import AppShell from '@/components/AppShell';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUserFromCookie();
  if (!user) redirect('/login');
  return (
    <AppShell
      user={{
        id: user.sub,
        name: user.name,
        email: user.email,
        role: user.role,
        title: ''
      }}
    >
      {children}
    </AppShell>
  );
}
