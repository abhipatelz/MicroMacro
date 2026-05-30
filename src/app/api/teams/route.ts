import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { isLead, requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { team as teamS } from '@/lib/serialize';
import { User } from '@/models/User';
import { TeamFunctionEnum } from '@/lib/validations';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

const Create = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  leadId: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  function: TeamFunctionEnum.optional()
});

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    // Admin sees all teams. Everyone else sees only teams they lead or belong to.
    const isAdmin = user.role === 'admin';
    const filter = isAdmin
      ? {}
      : { $or: [{ leadId: user.sub }, { memberIds: user.sub }] };

    const [teams, adminUsers, counts] = await Promise.all([
      Team.find(filter).sort({ name: 1 }).lean(),
      User.find({ role: 'admin' }, '_id').lean(),
      Project.aggregate([{ $group: { _id: '$teamId', c: { $sum: 1 } } }]),
    ]);
    const adminIds = new Set(adminUsers.map((u: any) => String(u._id)));
    const cmap = new Map(counts.map((c) => [String(c._id), c.c]));
    return NextResponse.json(
      teams.map((t) =>
        teamS(t, {
          // Exclude admin accounts from member count — admins are workspace
          // owners, not assignable team contributors.
          memberCount: (t.memberIds || []).filter((id: any) => !adminIds.has(String(id))).length,
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
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user!.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();
    const body = await readBody(req, Create);
    const team = await Team.create({
      name: body.name,
      description: body.description || '',
      leadId: body.leadId || undefined,
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
