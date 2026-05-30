import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser, requireRole, isAdmin } from '@/lib/auth';
import { guardTeamOwner } from '@/lib/teamAuth';
import { logOperation } from '@/lib/audit';
import { handleError, readBody } from '@/lib/http';
import { team as teamS, u, project as projectS } from '@/lib/serialize';
import { TeamUpdateSchema, DeleteTeamSchema } from '@/lib/validations';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const t = await Team.findById(params.id).lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Non-admins may only view a team they own (leadId) or belong to.
    if (!isAdmin(user!.role)) {
      const me = String(user!.sub);
      const isMember =
        String((t as any).leadId || '') === me ||
        ((t as any).memberIds || []).some((m: any) => String(m) === me);
      if (!isMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const memberIds = ((t as any).memberIds || []);
    const [users, projects] = await Promise.all([
      User.find({ _id: { $in: memberIds } }).lean(),
      Project.find({ teamId: params.id }).lean(),
    ]);
    const taskCounts = await Task.aggregate([
      { $match: { projectId: { $in: projects.map((p) => p._id) } } },
      { $group: { _id: { projectId: '$projectId', status: '$status' }, c: { $sum: 1 } } }
    ]);
    const projectAgg = new Map<string, { total: number; done: number }>();
    for (const c of taskCounts) {
      const key = String(c._id.projectId);
      const e = projectAgg.get(key) || { total: 0, done: 0 };
      e.total += c.c;
      if (c._id.status === 'done') e.done += c.c;
      projectAgg.set(key, e);
    }

    return NextResponse.json({
      ...teamS(t),
      // Admin users are workspace owners, not team contributors — exclude from
      // the member list so they don't inflate workload or count displays.
      members: users.filter((m: any) => m.role !== 'admin').map(u),
      projects: projects.map((p) => {
        const agg = projectAgg.get(String(p._id));
        return projectS(p, {
          taskCount: agg?.total || 0,
          tasksDone: agg?.done || 0
        });
      })
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'lead', 'admin');
    if (error) return error;
    await connectDB();

    const denied = await guardTeamOwner(params.id, user.sub, user.role);
    if (denied) return denied;

    const body = await readBody(req, TeamUpdateSchema);
    const current = await Team.findById(params.id).lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const patch: any = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description;
    if (body.function !== undefined) patch.function = body.function;
    if (body.leadId !== undefined) patch.leadId = body.leadId || undefined;
    if (body.memberIds !== undefined) {
      // Ensure lead is included as a member if a lead is set.
      const lead = body.leadId !== undefined ? body.leadId : (current as any).leadId;
      const ids = new Set(body.memberIds);
      if (lead) ids.add(String(lead));
      patch.memberIds = Array.from(ids);
    }

    await Team.updateOne({ _id: params.id }, { $set: patch });
    const fresh = await Team.findById(params.id).lean();
    await logOperation({
      action: 'team.update', category: 'team', actor: user,
      targetType: 'team', targetId: params.id, targetLabel: (fresh as any)?.name || '',
      summary: 'Updated team',
    });
    return NextResponse.json(teamS(fresh));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'lead', 'admin');
    if (error) return error;
    await connectDB();

    const denied = await guardTeamOwner(params.id, user.sub, user.role);
    if (denied) return denied;

    const body = await readBody(req, DeleteTeamSchema);
    const pmUser = await User.findById(user.sub).select('passwordHash').lean();
    if (!pmUser || !bcrypt.compareSync(body.password, (pmUser as any).passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const doomed = await Team.findById(params.id).select('name').lean();

    // Detach projects from this team rather than cascade-deleting them — projects
    // and their tasks represent real work and must survive a team disband.
    await Project.updateMany({ teamId: params.id }, { $set: { teamId: null } });
    await Team.deleteOne({ _id: params.id });

    await logOperation({
      action: 'team.delete', category: 'team', actor: user,
      targetType: 'team', targetId: params.id, targetLabel: (doomed as any)?.name || '',
      summary: `Deleted team ${(doomed as any)?.name || ''}`.trim(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
