import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { team as teamS } from '@/lib/serialize';
import { TeamFunctionEnum } from '@/lib/validations';
import { getLeadScope } from '@/lib/leadScope';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

const Create = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  leadId: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  function: TeamFunctionEnum.optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    // Non-admins only see teams they own (leadId) or belong to (memberIds);
    // admins see every team in the workspace.
    const scope = await getLeadScope(user!.sub, user!.role);
    const teamFilter = scope.unrestricted ? {} : { _id: { $in: scope.teamOids } };
    const teams = await Team.find(teamFilter).sort({ name: 1 }).lean();
    const counts = await Project.aggregate([{ $group: { _id: '$teamId', c: { $sum: 1 } } }]);
    const cmap = new Map(counts.map((c) => [String(c._id), c.c]));
    return NextResponse.json(
      teams.map((t) =>
        teamS(t, {
          memberCount: (t.memberIds || []).length,
          projectCount: cmap.get(String(t._id)) || 0
        })
      )
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Create);
    const team = await Team.create({
      name: body.name,
      description: body.description || '',
      leadId: body.leadId || undefined,
      // Auto-include the lead in memberIds so they appear on the team card,
      // can be picked as a task assignee, and show up in member rollups
      // without the admin having to add themselves a second time. Callers
      // can still override by passing an explicit memberIds array.
      memberIds: body.memberIds || (body.leadId ? [body.leadId] : []),
      function: body.function || 'general'
    });
    await logOperation({
      action: 'team.create', category: 'team', actor: user,
      targetType: 'team', targetId: String(team._id), targetLabel: team.name,
      summary: `Created team ${team.name}`,
    });
    return NextResponse.json(teamS(team));
  } catch (e) {
    return handleError(e);
  }
}
