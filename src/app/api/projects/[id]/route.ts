import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS, task as taskS } from '@/lib/serialize';
import { LIFECYCLES } from '@/lib/lifecycles';

export const runtime = 'nodejs';

const Patch = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  teamId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  gxpImpact: z.enum(['none', 'low', 'medium', 'high']).optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const p = await Project.findById(params.id).lean();
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const team = p.teamId ? await Team.findById(p.teamId).lean() : null;
    const owner = p.ownerId ? await User.findById(p.ownerId).lean() : null;
    const tasks = await Task.find({ projectId: p._id }).lean();
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
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Patch);
    const current = await Project.findById(params.id);
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
    const { error } = await requireRole(req, 'manager', 'admin', 'lead');
    if (error) return error;
    await connectDB();
    await Task.deleteMany({ projectId: params.id });
    await Project.deleteOne({ _id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
