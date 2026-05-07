import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';

export const runtime = 'nodejs';

const Patch = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  taskType: z
    .enum(['task', 'review', 'approval', 'test', 'deviation', 'capa', 'audit_finding', 'data_review'])
    .optional(),
  gxpCritical: z.boolean().optional(),
  requiresQaSignoff: z.boolean().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  phaseId: z.string().nullable().optional(),
  // Pharma fields
  ccNo:           z.string().optional(),
  ccTcd:          z.string().nullable().optional(),
  documentNo:     z.string().optional(),
  applicableSite: z.enum(['val', 'prd', 'val_prd', 'na']).optional(),
  deployStage:    z.enum(['dev', 'int', 'prd', 'na']).optional(),
  remarks:        z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const t = await Task.findById(params.id).lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const project = await Project.findById(t.projectId).lean();
    const assignee = t.assigneeId ? await User.findById(t.assigneeId).lean() : null;
    const qa = t.qaSignoffUserId ? await User.findById(t.qaSignoffUserId).lean() : null;
    const commentUsers = await User.find({
      _id: { $in: (t.comments || []).map((c: any) => c.userId) }
    }).lean();
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
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Patch);
    const current = await Task.findById(params.id);
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
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    await Task.deleteOne({ _id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
