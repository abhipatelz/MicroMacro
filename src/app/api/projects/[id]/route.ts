import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { requireUser, isLead, isAdmin } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS, task as taskS } from '@/lib/serialize';
import { LIFECYCLES } from '@/lib/lifecycles';
import { ProjectUpdateSchema, DeleteProjectSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const scope = await getLeadScope(user!.sub, user!.role);
    const p = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) }).lean();
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [team, owner, tasks] = await Promise.all([
      p.teamId ? Team.findById(p.teamId).lean() : Promise.resolve(null),
      p.ownerId ? User.findById(p.ownerId).lean() : Promise.resolve(null),
      Task.find({ projectId: p._id }).sort({ position: 1, createdAt: 1 }).lean(),
    ]);
    const assignees = await User.find({
      _id: { $in: tasks.map((t) => t.assigneeId).filter(Boolean) }
    }).lean();
    const uMap = new Map(assignees.map((u) => [String(u._id), u.name]));
    const lc = LIFECYCLES[(p.lifecycle || 'generic') as keyof typeof LIFECYCLES];
    return NextResponse.json({
      ...projectS(p, {
        teamName: (team as any)?.name || null,
        ownerName: (owner as any)?.name || null
      }),
      lifecycleMeta: lc
        ? {
            label: lc.label,
            description: lc.description,
            regulatoryRefs: lc.regulatoryRefs
          }
        : null,
      tasks: tasks.map((t) =>
        taskS(t, {
          assigneeName: t.assigneeId ? uMap.get(String(t.assigneeId)) : null,
          subtaskCount: ((t as any).subtasks || []).length,
          subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length
        })
      )
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const scope = await getLeadScope(user!.sub, user!.role);
    const body = await readBody(req, ProjectUpdateSchema);
    const current = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) }).select('status ownerId').lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Leads, or the owner of the project (e.g. a personal project), may edit it.
    const ownsProject = String((current as any).ownerId || '') === String(user!.sub);
    if (!isLead(user!.role) && !ownsProject) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    // Block marking completed when open tasks remain
    if (body.status === 'completed') {
      const openCount = await Task.countDocuments({ projectId: params.id, status: { $ne: 'done' } });
      if (openCount > 0) {
        return NextResponse.json(
          { error: `${openCount} task${openCount === 1 ? '' : 's'} still open — mark them done first` },
          { status: 422 },
        );
      }
    }

    const patch: any = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (['startDate', 'dueDate'].includes(k)) {
        patch[k] = v ? new Date(v as string) : null;
      } else {
        patch[k] = v;
      }
    }
    if (body.status === 'completed' && current.status !== 'completed') {
      patch.completedAt = new Date();
    } else if (body.status && body.status !== 'completed') {
      patch.completedAt = null;
    }
    await Project.updateOne({ _id: params.id }, { $set: patch });
    const fresh = await Project.findById(params.id).lean();
    return NextResponse.json(projectS(fresh));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Deleting a project is destructive + irreversible. Team projects are
    // admin-only; a personal project can be deleted by its own owner.
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const scope = await getLeadScope(user!.sub, user!.role);
    const existing = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) }).select('_id ownerId personal').lean();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ownsPersonal = !!(existing as any).personal && String((existing as any).ownerId || '') === String(user!.sub);
    if (!isAdmin(user!.role) && !ownsPersonal) {
      return NextResponse.json({ error: 'Only an admin can delete this project.' }, { status: 403 });
    }

    const body = await readBody(req, DeleteProjectSchema);
    const pmUser = await User.findById(user!.sub).select('passwordHash').lean();
    if (!pmUser || !bcrypt.compareSync(body.password, (pmUser as any).passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    await Task.deleteMany({ projectId: params.id });
    await Project.deleteOne({ _id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
