import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { TaskUpdateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

export const runtime = 'nodejs';

async function assertTaskInScope(taskId: string, userId: string) {
  const t = await Task.findById(taskId).select('projectId').lean();
  if (!t) return { t: null, forbidden: false };
  const scope = await getLeadScope(userId);
  const proj = await Project.findOne({ _id: t.projectId, ...projectsVisibleFilter(scope) }).select('_id').lean();
  return { t, forbidden: !proj };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { forbidden } = await assertTaskInScope(params.id, user!.sub);
    if (forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const t = await Task.findById(params.id).lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [project, assignee, qa, commentUsers] = await Promise.all([
      Project.findById(t.projectId).lean(),
      t.assigneeId ? User.findById(t.assigneeId).lean() : Promise.resolve(null),
      t.qaSignoffUserId ? User.findById(t.qaSignoffUserId).lean() : Promise.resolve(null),
      User.find({ _id: { $in: (t.comments || []).map((c: any) => c.userId) } }).lean(),
    ]);
    const uMap = new Map(commentUsers.map((u) => [String(u._id), u.name]));
    const comments = (t.comments || []).map((c: any) => ({
      id: String(c._id),
      userId: String(c.userId),
      userName: uMap.get(String(c.userId)) || 'User',
      body: c.body,
      createdAt: c.createdAt
    }));
    return NextResponse.json({
      ...taskS(t, {
        assigneeName: (assignee as any)?.name || null,
        qaSignoffName: (qa as any)?.name || null,
        projectCode: (project as any)?.code,
        projectName: (project as any)?.name
      }),
      comments
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
    const { forbidden } = await assertTaskInScope(params.id, user!.sub);
    if (forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await readBody(req, TaskUpdateSchema);
    const current = await Task.findById(params.id).select('status').lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const set: any = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (['startDate', 'dueDate', 'ccTcd'].includes(k)) set[k] = v ? new Date(v as string) : null;
      else set[k] = v;
    }
    if (body.status === 'done' && current.status !== 'done') set.completedAt = new Date();
    else if (body.status && body.status !== 'done') set.completedAt = null;
    set.lastActivityAt = new Date();
    await Task.updateOne({ _id: params.id }, { $set: set });
    const fresh = await Task.findById(params.id).lean();
    return NextResponse.json(taskS(fresh));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { t, forbidden } = await assertTaskInScope(params.id, user!.sub);
    if (!t || forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await Task.deleteOne({ _id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}