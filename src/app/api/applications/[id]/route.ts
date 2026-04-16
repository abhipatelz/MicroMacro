import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Application } from '@/models/Application';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS, u } from '@/lib/serialize';

export const runtime = 'nodejs';

const Patch = z.object({
  name: z.string().optional(),
  vendor: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  status: z.enum(['operational', 'under_implementation', 'under_upgrade', 'retired']).optional(),
  defaultLifecycle: z
    .enum([
      'csv',
      'sop',
      'deviation_capa',
      'change_control',
      'audit',
      'validation',
      'data_integrity',
      'pharmacovigilance',
      'generic'
    ])
    .optional(),
  gxp: z.boolean().optional(),
  tags: z.array(z.string()).optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const app = await Application.findById(params.id).lean();
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const owner = (app as any).ownerId
      ? await User.findById((app as any).ownerId).lean()
      : null;
    const memberIds = ((app as any).memberIds || []) as any[];
    const members = await User.find({ _id: { $in: memberIds } }).lean();
    const projects = await Project.find({ applicationId: app._id }).lean();

    // task aggregates per project
    const taskAgg = await Task.aggregate([
      { $match: { projectId: { $in: projects.map((p) => p._id) } } },
      { $group: { _id: { projectId: '$projectId', status: '$status' }, c: { $sum: 1 } } }
    ]);
    const agg = new Map<string, { total: number; done: number }>();
    for (const r of taskAgg) {
      const key = String(r._id.projectId);
      const e = agg.get(key) || { total: 0, done: 0 };
      e.total += r.c;
      if (r._id.status === 'done') e.done += r.c;
      agg.set(key, e);
    }

    return NextResponse.json({
      id: String(app._id),
      key: (app as any).key,
      name: (app as any).name,
      vendor: (app as any).vendor,
      description: (app as any).description,
      status: (app as any).status,
      defaultLifecycle: (app as any).defaultLifecycle,
      gxp: !!(app as any).gxp,
      tags: (app as any).tags || [],
      ownerId: (app as any).ownerId ? String((app as any).ownerId) : null,
      ownerName: (owner as any)?.name || null,
      members: members.map(u),
      projects: projects.map((p) => {
        const a = agg.get(String(p._id));
        return projectS(p, { taskCount: a?.total || 0, tasksDone: a?.done || 0 });
      })
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'manager', 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Patch);
    const set: any = {};
    for (const [k, v] of Object.entries(body)) if (v !== undefined) set[k] = v;
    await Application.updateOne({ _id: params.id }, { $set: set });
    const fresh = await Application.findById(params.id).lean();
    if (!fresh) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const projectCount = await Project.countDocuments({ applicationId: params.id });
    if (projectCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${projectCount} project(s) still reference this application.` },
        { status: 400 }
      );
    }
    await Application.deleteOne({ _id: params.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
