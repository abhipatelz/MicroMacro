import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { getTaskAccess } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import { subtask as subS } from '@/lib/serialize';
import { logOperation } from '@/lib/audit';
import { recordTaskFlowEvent } from '@/lib/flow/events';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({
  title: z.string().min(1).max(300),
  // Must be a real ObjectId (or empty) — a free-text string here would store a
  // dangling reference that $in/$pull silently miss, leaving a subtask
  // "assigned" to a phantom user.
  assigneeId: z.union([z.string().regex(/^[a-f\d]{24}$/i, 'Invalid assignee'), z.literal('')]).optional(),
  dueDate: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }
    await connectDB();
    const body = await readBody(req, Body);

    // Creating a subtask is allowed for leads/admins AND for the task's
    // assignee (they're the ones doing the work and breaking it down).
    // Non-assignee contributors remain blocked — they can only toggle
    // subtasks they can already see.
    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!access.isLead && !access.isAssignee) {
      return NextResponse.json({ error: 'Only the assignee or a lead can add subtasks.' }, { status: 403 });
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sub = {
      _id: new mongoose.Types.ObjectId(),
      title: body.title,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      status: 'todo' as const,
      position: (t as any).subtasks?.length || 0,
    };
    (t as any).subtasks.push(sub);
    await t.save();

    void recordTaskFlowEvent({
      taskId: params.id,
      projectId: String((t as any).projectId || ''),
      eventType: 'subtask_created',
      actorId: user.sub,
      taskType: (t as any)?.taskType || undefined,
      metadata: { subtaskCount: ((t as any).subtasks || []).length },
    });

    // Structural change to a (possibly GxP) record → audit trail.
    await logOperation({
      action: 'task.subtask.add',
      category: 'task',
      actor: user,
      targetType: 'task',
      targetId: params.id,
      targetLabel: (t as any).title || '',
      summary: `Added subtask "${body.title}"`,
      meta: { subtaskId: String(sub._id), title: body.title, gxpCritical: !!(t as any).gxpCritical },
    });

    return NextResponse.json(subS(sub));
  } catch (e) {
    return handleError(e);
  }
}
