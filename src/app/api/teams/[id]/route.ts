import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { team as teamS, u, project as projectS } from '@/lib/serialize';
import { TeamUpdateSchema, DeleteTeamSchema } from '@/lib/validations';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const t = await Team.findById(params.id).lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
      members: users.map(u),
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
    const { error } = await requireRole(req, 'pm', 'lead');
    if (error) return error;
    await connectDB();

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
    return NextResponse.json(teamS(fresh));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'pm', 'lead');
    if (error) return error;
    await connectDB();

    const body = await readBody(req, DeleteTeamSchema);
    const pmUser = await User.findById(user.sub).select('passwordHash').lean();
    if (!pmUser || !bcrypt.compareSync(body.password, (pmUser as any).passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    // Detach projects from this team rather than cascade-deleting them — projects
    // and their tasks represent real work and must survive a team disband.
    await Project.updateMany({ teamId: params.id }, { $set: { teamId: null } });
    await Team.deleteOne({ _id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
