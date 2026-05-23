import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { u } from '@/lib/serialize';
import { getCurrentUserFromCookie } from '@/lib/auth';
import PeopleClient from './PeopleClient';

/**
 * Server-rendered People page. The user list and the "me" object are
 * resolved server-side so the page paints with real rows immediately
 * — no skeleton, no client-side waterfall.
 */
export default async function PeoplePage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  await connectDB();
  const users = await User.find({}).sort({ name: 1 }).lean();

  return (
    <PeopleClient
      initialUsers={users.map(u)}
      me={{
        id:    jwt.sub,
        name:  jwt.name,
        email: jwt.email,
        role:  jwt.role,
      }}
    />
  );
}
