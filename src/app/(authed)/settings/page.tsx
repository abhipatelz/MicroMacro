import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { u } from '@/lib/serialize';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  await connectDB();
  const userDoc = await User.findById(jwt.sub).lean();
  if (!userDoc) redirect('/login');

  return <SettingsClient initialUser={u(userDoc)} />;
}
