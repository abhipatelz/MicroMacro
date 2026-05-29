import { Team } from '@/models/Team';
import mongoose from 'mongoose';

// Scope of records visible to the current viewer.
//
// All roles use actual team memberships — a user sees only projects where
// they are the owner or assigned to a team they lead/belong to. This applies
// to every role including admin: the admin role grants access to the People,
// Audit, and Teams management surfaces, but not blanket project visibility.
export interface LeadScope {
  userOid:      mongoose.Types.ObjectId;
  teamOids:     mongoose.Types.ObjectId[];     // teams the user leads or belongs to
  memberOids:   mongoose.Types.ObjectId[];     // union of memberIds across those teams (incl. the user themselves)
  unrestricted: boolean;                       // always false — kept for interface stability
}

export async function getLeadScope(userId: string, _role?: string | null): Promise<LeadScope> {
  const userOid = new mongoose.Types.ObjectId(userId);

  // A user can see projects for any team they lead OR belong to as a member.
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

  return { userOid, teamOids, memberOids, unrestricted: false as const };
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
