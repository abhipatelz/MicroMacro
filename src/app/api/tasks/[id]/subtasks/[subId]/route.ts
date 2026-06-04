import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { getTaskAccess, canActOnOwnTask } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import { subtask as subS } from '@/lib/serialize';
import { logOperation } from '@/lib/audit';
import { recordTaskFlowEvent } from '@/lib/flow/events';

export const runtime = 'nodejs';

const Patch = z.object({
  title: z.string().max(300).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }
    await connectDB();
    const body = await readBody(req, Patch);

    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    // Toggling a subtask's status is an assignee-level action; retitling or
    // reassigning a subtask is structural → lead-only.
    const onlyStatus = body.title === undefined && body.assigneeId === undefined && body.dueDate === undefined;
    const allowed = access.isLead || (canActOnOwnTask(access) && onlyStatus);
    if (!allowed) {
      return NextResponse.json(
        { error: 'You can only tick off subtasks on a task assigned to you.' },
        { status: 403 },
      );
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sub = (t as any).subtasks.id(params.subId);
    if (!sub) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    const prev = sub.status;
    if (body.title !== undefined) sub.title = body.title;
    if (body.status !== undefined) {
      sub.status = body.status;
      if (body.status === 'done' && prev !== 'done') sub.completedAt = new Date();
      else if (body.status !== 'done') sub.completedAt = null;
    }
    if (body.assigneeId !== undefined) sub.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined) sub.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    await t.save();

    // Flow Signal: a subtask status transition advances the PARENT task's
    // meaningful activity — historically this was overlooked, leaving a
    // parent looking idle while its subtasks were actively being closed.
    // Title/assignee/dueDate edits to a subtask are structural, not progress.
    if (body.status !== undefined && body.status !== prev) {
      void recordTaskFlowEvent({
        taskId: params.id,
        projectId: String((t as any).projectId || ''),
        eventType: 'subtask_progressed',
        actorId: user.sub,
        stateBefore: prev,
        stateAfter:  body.status,
        taskType:    (t as any)?.taskType || undefined,
        metadata: { subtaskId: params.subId },
      });
    }
    return NextResponse.json(subS(sub));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }
    await connectDB();

    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!access.isLead) {
      return NextResponse.json({ error: 'Only leads can delete subtasks.' }, { status: 403 });
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const removed = (t as any).subtasks.id(params.subId);
    const removedTitle = removed?.title || '';
    (t as any).subtasks = (t as any).subtasks.filter((s: any) => String(s._id) !== params.subId);
    await t.save();

    // Structural change to a (possibly GxP) record → audit trail.
    await logOperation({
      action: 'task.subtask.delete', category: 'task', actor: user,
      targetType: 'task', targetId: params.id, targetLabel: (t as any).title || '',
      summary: `Deleted subtask "${removedTitle}"`,
      meta: { subtaskId: params.subId, title: removedTitle, gxpCritical: !!(t as any).gxpCritical },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
