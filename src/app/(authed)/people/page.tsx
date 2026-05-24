import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { u } from '@/lib/serialize';
import { getCurrentUserFromCookie, isAdmin } from '@/lib/auth';
import PeopleClient from './PeopleClient';

/**
 * Server-rendered People page — workspace user management. ADMIN ONLY:
 * creating, resetting, unlocking, deleting, and re-roling accounts is
 * reserved for the single workspace admin. Team leads compose their
 * teams from the Team page and never see this surface.
 */
export default async function PeoplePage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (!isAdmin(jwt.role)) redirect('/');

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
