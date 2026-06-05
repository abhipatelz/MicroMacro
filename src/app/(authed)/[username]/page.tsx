import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { u } from '@/lib/serialize';
import ProfileView from '@/components/ProfileView';

/**
 * Public-within-workspace profile at /<username> — GitHub/LinkedIn style.
 *
 * This is a dynamic segment at the authed root, so static routes (/projects,
 * /teams, /settings, …) always win; only an otherwise-unmatched single path
 * segment lands here and is resolved as a username. Unknown handles 404.
 *
 * Usernames are stored lower-cased + unique on the User model, so the lookup
 * is a single indexed query. Case-insensitive: we lower-case the param.
 */

async function findByUsername(username: string) {
  await connectDB();
  const handle = decodeURIComponent(username || '').trim().toLowerCase();
  if (!handle || !/^[a-z0-9._-]{2,40}$/.test(handle)) return null;
  return User.findOne({ username: handle }).lean();
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const doc = await findByUsername(params.username).catch(() => null);
  if (!doc) return { title: 'Profile not found · Pragati' };
  return { title: `${(doc as any).name} (@${(doc as any).username}) · Pragati` };
}

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  const doc = await findByUsername(params.username);
  if (!doc) notFound();

  const profile = u(doc);
  if (!profile?.id) notFound();
  const isSelf = profile.id === jwt.sub;

  return <ProfileView profile={{ ...profile, id: profile.id }} isSelf={isSelf} />;
}
