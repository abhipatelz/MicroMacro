import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { team as teamS } from '@/lib/serialize';
import TeamsClient from './TeamsClient';

export default async function TeamsPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');

  await connectDB();

  // Each user sees only the teams they lead or belong to (same access boundary
  // as the API route). Admin users are workspace owners and also see their teams.
  const filter = { $or: [{ leadId: jwt.sub }, { memberIds: jwt.sub }] };

  const teams = await Team.find(filter).sort({ name: 1 }).lean();
  const teamIds = teams.map((t: any) => t._id).filter(Boolean);

  const [adminUsers, counts] = await Promise.all([
    User.find({ role: 'admin' }, '_id').lean(),
    teamIds.length
      ? Project.aggregate([
          { $match: { teamId: { $in: teamIds } } },
          { $group: { _id: '$teamId', c: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const canManage = jwt.role === 'lead' || jwt.role === 'admin';
  const visibleUserIds = Array.from(new Set(teams.flatMap((t: any) => [t.leadId, ...(t.memberIds || [])].filter(Boolean).map(String))));
  const users = await User.find(
    canManage ? { active: { $ne: false } } : { _id: { $in: visibleUserIds }, active: { $ne: false } },
  )
    .select('name role title department organisation location')
    .sort({ name: 1 })
    .lean();

  const adminIds = new Set(adminUsers.map((u: any) => String(u._id)));
  const cmap = new Map(counts.map((c: any) => [String(c._id), c.c]));

  const initialTeams = teams.map((t) =>
    teamS(t, {
      memberCount: (t.memberIds || []).filter((id: any) => !adminIds.has(String(id))).length,
      projectCount: cmap.get(String(t._id)) || 0,
    })
  );

  const initialUsers = users.map((u: any) => ({
    id: String(u._id),
    name: u.name,
    role: u.role === 'pm' ? 'lead' : u.role === 'employee' ? 'contributor' : u.role,
    title:        u.title        || undefined,
    department:   u.department   || '',
    organisation: u.organisation || '',
    location:     u.location     || '',
  }));

  return (
    <TeamsClient
      initialTeams={initialTeams as any}
      initialUsers={initialUsers}
      me={{ id: jwt.sub, name: jwt.name, role: jwt.role }}
    />
  );
}
