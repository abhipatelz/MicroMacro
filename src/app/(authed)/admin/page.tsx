import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie, isAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { AuditLog } from '@/models/AuditLog';
import { Invite } from '@/models/Invite';
import AdminConsole from './AdminConsole';

export const runtime = 'nodejs';

export default async function AdminPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (!isAdmin(jwt.role)) redirect('/');

  await connectDB();

  const now = new Date();

  const [
    totalActive,
    leadCount,
    lockedUsers,
    lockedTotal,
    mustChangePw,
    pendingInvites,
    deactivatedCount,
    recentActivity,
  ] = await Promise.all([
    User.countDocuments({ active: { $ne: false } }),
    User.countDocuments({ role: { $in: ['lead', 'admin'] }, active: { $ne: false } }),
    User.find({ locked: true, active: { $ne: false } })
      .select('name username email lockedAt')
      .sort({ lockedAt: -1 })
      .limit(10)
      .lean(),
    // The list above is capped at 10 for the card preview, but the stat must
    // count EVERY locked account — otherwise an admin with >10 lockouts sees a
    // misleadingly low "10" and may miss accounts that need attention.
    User.countDocuments({ locked: true, active: { $ne: false } }),
    User.find({ mustChangePassword: true, active: { $ne: false } })
      .select('name username email createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Invite.countDocuments({
      consumedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    }),
    User.countDocuments({ active: false }),
    AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(12)
      .lean(),
  ]);

  const serialize = (u: any) => ({
    id: String(u._id),
    name: u.name || '',
    username: u.username || '',
    email: u.email || '',
    lockedAt: u.lockedAt ? (u.lockedAt instanceof Date ? u.lockedAt.toISOString() : String(u.lockedAt)) : null,
    createdAt: u.createdAt ? (u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt)) : null,
  });

  return (
    <AdminConsole
      adminName={jwt.name}
      stats={{
        totalActive,
        leadCount,
        contributorCount: totalActive - leadCount,
        lockedCount: lockedTotal,
        pendingInvites,
        deactivatedCount,
      }}
      lockedUsers={(lockedUsers as any[]).map(serialize)}
      mustChangePwUsers={(mustChangePw as any[]).map(serialize)}
      recentActivity={(recentActivity as any[]).map((r) => ({
        id: String(r._id),
        action: r.action || '',
        category: r.category || 'general',
        actorName: r.actorName || '',
        targetLabel: r.targetLabel || '',
        summary: r.summary || '',
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))}
    />
  );
}
