import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { requireUser, canMutate } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { TaskUpdateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { notify } from '@/lib/notify';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

async function assertTaskInScope(taskId: string, userId: string, role?: string | null) {
  const t = await Task.findById(taskId).select('projectId').lean();
  if (!t) return { t: null, forbidden: false, ownsPersonal: false };
  const scope = await getLeadScope(userId, role);
  const proj = await Project.findOne({ _id: t.projectId, ...projectsVisibleFilter(scope) })
    .select('_id isPersonal ownerId').lean();
  // The owner of a personal project has full authority over its tasks, even as
  // an IC — a private workspace would be pointless otherwise.
  const ownsPersonal = !!(proj && (proj as any).isPersonal && String((proj as any).ownerId) === String(userId));
  return { t, forbidden: !proj, ownsPersonal };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { forbidden } = await assertTaskInScope(params.id, user!.sub, user!.role);
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
    const { forbidden, ownsPersonal } = await assertTaskInScope(params.id, user!.sub, user!.role);
    if (forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await readBody(req, TaskUpdateSchema);
    const current = await Task.findById(params.id).select('status assigneeId').lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Contributors (non-leads) on their OWN task may update the status and
    // flag who it's stuck/pending with — nothing else. Title, due date,
    // assignee, priority, etc. remain lead-only. Leads keep full edit rights.
    // Exception: inside their own personal project, the owner edits freely.
    if (!canMutate(user!.role) && !ownsPersonal) {
      const isAssignee = current.assigneeId && String(current.assigneeId) === String(user!.sub);
      const keys = Object.keys(body).filter(k => body[k as keyof typeof body] !== undefined);
      const ALLOWED_FOR_ASSIGNEE = new Set(['status', 'pendingWith']);
      const onlyAllowed = isAssignee && keys.length > 0 && keys.every(k => ALLOWED_FOR_ASSIGNEE.has(k));
      if (!onlyAllowed) {
        return NextResponse.json(
          { error: 'Contributors can only change the status and "waiting on" of their own tasks.' },
          { status: 403 },
        );
      }
    }

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

    // ── Notifications ────────────────────────────────────────────────
    // Reassigned → tell the new assignee. Marked done by an assignee →
    // tell the project owner their work landed.
    const reassigned = body.assigneeId !== undefined
      && String(body.assigneeId || '') !== String(current.assigneeId || '');
    if (reassigned && body.assigneeId) {
      await notify({
        userId:    String(body.assigneeId),
        actorId:   user!.sub,
        type:      'task_assigned',
        title:     'New task assigned to you',
        body:      (fresh as any)?.title || '',
        taskId:    params.id,
        projectId: String((fresh as any)?.projectId || ''),
      });
    }
    if (body.status === 'done' && current.status !== 'done') {
      const proj = await Project.findById((fresh as any)?.projectId).select('ownerId name').lean();
      if (proj && (proj as any).ownerId) {
        await notify({
          userId:    String((proj as any).ownerId),
          actorId:   user!.sub,
          type:      'task_done',
          title:     'A task was completed',
          body:      (fresh as any)?.title || '',
          taskId:    params.id,
          projectId: String((fresh as any)?.projectId || ''),
        });
      }
    }

    const statusChanged = !!body.status && body.status !== current.status;
    const proj = await Project.findById((fresh as any)?.projectId).select('isPersonal code').lean();
    if (!((proj as any)?.isPersonal || String((proj as any)?.code || '').startsWith('PRSN-'))) {
      await logOperation({
        action: statusChanged ? 'task.status' : 'task.update', category: 'task', actor: user,
        targetType: 'task', targetId: params.id, targetLabel: (fresh as any)?.title || '',
        summary: statusChanged ? `Task status → ${body.status}` : 'Updated task',
        meta: { projectId: String((fresh as any)?.projectId || '') },
      });
    }

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
    const { t, forbidden, ownsPersonal } = await assertTaskInScope(params.id, user!.sub, user!.role);
    if (!t || forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Leads delete any task; ICs may delete tasks inside their own personal project.
    if (!canMutate(user!.role) && !ownsPersonal) {
      return NextResponse.json({ error: 'Only leads can delete tasks.' }, { status: 403 });
    }
    const doomed = await Task.findById(params.id).select('title projectId').lean();
    await Task.deleteOne({ _id: params.id });

    const doomedProj = await Project.findById((doomed as any)?.projectId).select('isPersonal code').lean();
    if (!((doomedProj as any)?.isPersonal || String((doomedProj as any)?.code || '').startsWith('PRSN-'))) {
      await logOperation({
        action: 'task.delete', category: 'task', actor: user,
        targetType: 'task', targetId: params.id, targetLabel: (doomed as any)?.title || '',
        summary: `Deleted task "${(doomed as any)?.title || ''}"`,
        meta: { projectId: String((doomed as any)?.projectId || '') },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}