import { Team } from '@/models/Team';
import mongoose from 'mongoose';

// Scope of records visible to a single team lead.
//
// Phase-1 visibility rule (decided in PR #35):
//   A lead sees ONLY:
//     • projects where they are the owner (project.ownerId === userId), OR
//     • projects assigned to a team where they're the leadId.
//   The people-workload panel on the dashboard surfaces ONLY members of
//   teams they lead.
//
// Other leads' projects, tasks, and team members are invisible — both in
// the dashboard rollup and on the projects list / detail pages.
export interface LeadScope {
  userOid:    mongoose.Types.ObjectId;
  teamOids:   mongoose.Types.ObjectId[];     // teams where this user is leadId
  memberOids: mongoose.Types.ObjectId[];     // union of memberIds across those teams (incl. the lead themselves)
}

export async function getLeadScope(userId: string): Promise<LeadScope> {
  const userOid = new mongoose.Types.ObjectId(userId);
  const teams = await Team.find(
    { leadId: userOid },
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

  return { userOid, teamOids, memberOids };
}

// Mongo filter that returns true for every project the lead can see.
// Pass as the first arg to Project.find / countDocuments / aggregate $match.
export function projectsVisibleFilter(scope: LeadScope) {
  return {
    $or: [
      { ownerId: scope.userOid },
      { teamId:  { $in: scope.teamOids } },
    ],
  };
}
