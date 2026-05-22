import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getLeadDashboardData } from '@/lib/leadDashboard';
import DashboardClient from './DashboardClient';

// Server-rendered: data is fetched on the server so the HTML streams with
// real content on the first paint — no client-side waterfall.
export default async function DashboardPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  const [data, fresh] = await Promise.all([
    getLeadDashboardData({
      sub:   jwt.sub,
      name:  jwt.name,
      email: jwt.email,
      role:  jwt.role,
    }),
    connectDB().then(() => User.findById(jwt.sub, 'hasSeenTour').lean()),
  ]);

  // Default to true when the field is missing (existing users predating
  // this flag have already onboarded and shouldn't see the tour).
  const hasSeenTour = fresh?.hasSeenTour !== false;

  return <DashboardClient initialData={data} hasSeenTour={hasSeenTour} />;
}
