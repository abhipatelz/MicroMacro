import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { getTaskAccess } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import { computeFlowSignal } from '@/lib/flowSignal.compute';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';

const Body = z.object({
  nudge: z.boolean().optional().default(false),
});

/**
 * POST /api/tasks/:id/flow-check
 *
 * Returns the FLOW SIGNAL state for a task — computed purely from observable
 * facts (lastActivityAt, status, priority, pendingWith). Leads may optionally
 * pass { nudge: true } to fire a 'task_waiting' notification to the assignee,
 * prompting them to give an update.
 *
 * Read-access is scoped to leads/admin. Contributors do not see the flow strip
 * (it's a management surface, not an IC surface).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
      return NextResponse.json({ error: 'Flow check is available to leads and admins.' }, { status: 403 });
    }

    const body = await readBody(req, Body);
    const t = access.task as any;

    const { signal, daysSinceActivity, warnHours, stallHours } = computeFlowSignal({
      status:         t.status,
      priority:       t.priority,
      pendingWith:    t.pendingWith,
      lastActivityAt: t.lastActivityAt || t.updatedAt || t.createdAt,
    });

    // Nudge: send a task_waiting notification to the assignee. Only useful
    // when the task has an assignee and isn't already done.
    let nudgeSent = false;
    if (body.nudge && t.assigneeId && t.status !== 'done') {
      await notify({
        userId:    String(t.assigneeId),
        actorId:   user.sub,
        type:      'task_waiting',
        title:     'Update requested on your task',
        body:      t.title || '',
        taskId:    params.id,
        projectId: String(t.projectId || ''),
      });
      // Update the task's lastActivityAt so the signal resets after a nudge —
      // the lead has now engaged, giving the assignee a fresh window to respond.
      await Task.findByIdAndUpdate(params.id, { $set: { lastActivityAt: new Date() } });
      nudgeSent = true;
    }

    return NextResponse.json({
      taskId:          params.id,
      title:           t.title || '',
      status:          t.status,
      priority:        t.priority || 'medium',
      assigneeId:      t.assigneeId ? String(t.assigneeId) : null,
      pendingWith:     t.pendingWith || '',
      lastActivityAt:  t.lastActivityAt
        ? new Date(t.lastActivityAt).toISOString()
        : null,
      flowSignal: {
        signal,
        daysSinceActivity,
        warnHours,
        stallHours,
      },
      nudgeSent,
    });
  } catch (e) {
    return handleError(e);
  }
}
