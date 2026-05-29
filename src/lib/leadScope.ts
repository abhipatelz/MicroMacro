import { Team } from '@/models/Team';
import { User } from '@/models/User';
import mongoose from 'mongoose';
import { isAdmin } from '@/lib/auth';

// Scope of records visible to the current viewer.
//
// Default (lead/pm) visibility rule:
//   A lead sees ONLY:
//     • projects where they are the owner (project.ownerId === userId), OR
//     • projects assigned to a team where they are the leadId OR a member.
//   The people-workload panel surfaces members of all teams the lead
//   belongs to (as leadId or memberIds).
//
// Admin override:
//   The single configured 'admin' role sees EVERY team, project, and user
//   in the workspace. The `unrestricted` flag signals callers to skip the
//   visibility filter entirely.
//
// Other roles' projects, tasks, and team members remain invisible to a
// non-admin lead — both in the dashboard rollup and on the projects list.
export interface LeadScope {
  userOid:      mongoose.Types.ObjectId;
  teamOids:     mongoose.Types.ObjectId[];     // teams the lead leads or belongs to
  memberOids:   mongoose.Types.ObjectId[];     // union of memberIds across those teams (incl. the lead themselves)
  unrestricted: boolean;                       // true ⇒ admin: ignore the visibility filter
}

export async function getLeadScope(userId: string, role?: string | null): Promise<LeadScope> {
  const userOid = new mongoose.Types.ObjectId(userId);

  // Admin sees everything. Pre-compute teamOids/memberOids as the full set
  // so the people-workload panel & per-assignee filters can still aggregate
  // without a separate code path.
  if (isAdmin(role)) {
    const [allTeams, allUsers] = await Promise.all([
      Team.find({}, '_id memberIds').lean(),
      User.find({}, '_id').lean(),
    ]);
    return {
      userOid,
      teamOids:     allTeams.map(t => t._id),
      memberOids:   allUsers.map(u => u._id),
      unrestricted: true,
    };
  }

  // A team lead can see projects for any team they lead OR belong to as a member.
  const teams = await Team.find(
    { $or: [{ leadId: userOid }, { memberIds: userOid }] },
    '_id memberIds',
  ).lean();

  const teamOids = teams.map(t => t._id);

  // Build the member set — include the lead themselves so their own tasks
  // always surface even before anyone is assigned to their team.
  const memberSet = new Set<string>([String(userOid)]);
  for (const t of teams) {
    for (const m of (t.memberIds || [])) memberSet.add(String(m));
  }
  const memberOids = [...memberSet].map(id => new mongoose.Types.ObjectId(id));

  return { userOid, teamOids, memberOids, unrestricted: false };
}

// Matches projects that are NOT someone's private personal to-do list.
// A project is personal if isPersonal === true OR (legacy rows) its code
// starts with "PRSN-". Spread into any raw Project query that an admin or
// other user can see, to keep personal projects out of cross-user rollups.
export const NOT_PERSONAL = {
  isPersonal: { $ne: true },
  code: { $not: /^PRSN-/ },
} as const;

// Mongo filter that returns true for every project the viewer can see.
// Pass as the first arg to Project.find / countDocuments / aggregate $match.
//
// Personal projects are private to their owner: they're only ever returned
// when the viewer owns them — never to another lead, and never to the admin
// (even though the admin otherwise sees everything).
export function projectsVisibleFilter(scope: LeadScope) {
  const minePersonalOrNotPersonal = {
    $or: [{ ownerId: scope.userOid }, NOT_PERSONAL],
  };
  if (scope.unrestricted) return minePersonalOrNotPersonal;
  return {
    $and: [
      minePersonalOrNotPersonal,
      { $or: [{ ownerId: scope.userOid }, { teamId: { $in: scope.teamOids } }] },
    ],
  };
}
