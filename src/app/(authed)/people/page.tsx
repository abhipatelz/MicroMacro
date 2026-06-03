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

  // Scale-aware initial load. Leads/admins and deactivated accounts are few, so
  // we send them in full (their sections must always be complete). Active
  // contributors are the unbounded set — we send only the first page and let
  // the client paginate ("Load more") or search the server for the rest, so
  // first paint stays bounded no matter how large the workspace grows.
  const CONTRIB_PAGE = 150;
  const LEAD_ROLES = ['lead', 'admin', 'pm'];
  const CONTRIB_ROLES = ['contributor', 'employee'];
  const [leads, contributors, deactivated, contribTotal] = await Promise.all([
    User.find({ role: { $in: LEAD_ROLES }, active: { $ne: false } }).sort({ name: 1 }).lean(),
    User.find({ role: { $in: CONTRIB_ROLES }, active: { $ne: false } }).sort({ name: 1 }).limit(CONTRIB_PAGE).lean(),
    User.find({ active: false }).sort({ name: 1 }).lean(),
    User.countDocuments({ role: { $in: CONTRIB_ROLES }, active: { $ne: false } }),
  ]);

  return (
    <PeopleClient
      initialUsers={[...leads, ...contributors, ...deactivated].map(u)}
      contribTotal={contribTotal}
      contribPage={CONTRIB_PAGE}
      me={{
        id:    jwt.sub,
        name:  jwt.name,
        email: jwt.email,
        role:  jwt.role,
      }}
    />
  );
}
