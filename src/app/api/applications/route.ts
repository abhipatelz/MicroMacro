import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Application } from '@/models/Application';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Create = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string().optional(),
  description: z.string().optional(),
  ownerId: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
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

function serialize(a: any, extras: Record<string, unknown> = {}) {
  return {
    id: String(a._id),
    key: a.key,
    name: a.name,
    vendor: a.vendor,
    description: a.description,
    status: a.status,
    defaultLifecycle: a.defaultLifecycle,
    gxp: !!a.gxp,
    tags: a.tags || [],
    ownerId: a.ownerId ? String(a.ownerId) : null,
    memberIds: (a.memberIds || []).map((m: any) => String(m)),
    createdAt: a.createdAt,
    ...extras
  };
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const apps = await Application.find({}).sort({ key: 1 }).lean();
    const projectAgg = await Project.aggregate([
      { $match: { applicationId: { $in: apps.map((a) => a._id) } } },
      { $group: { _id: '$applicationId', c: { $sum: 1 } } }
    ]);
    const taskAgg = await Task.aggregate([
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
          foreignField: '_id',
          as: 'p'
        }
      },
      { $unwind: '$p' },
      { $match: { 'p.applicationId': { $in: apps.map((a) => a._id) } } },
      {
        $group: {
          _id: { app: '$p.applicationId', status: '$status' },
          c: { $sum: 1 }
        }
      }
    ]);
    const pMap = new Map(projectAgg.map((x) => [String(x._id), x.c]));
    const tAgg = new Map<string, { total: number; done: number; overdueOpen: number }>();
    for (const r of taskAgg) {
      const key = String(r._id.app);
      const e = tAgg.get(key) || { total: 0, done: 0, overdueOpen: 0 };
      e.total += r.c;
      if (r._id.status === 'done') e.done += r.c;
      tAgg.set(key, e);
    }
    // overdue counts need a separate query
    const now = new Date();
    const overdueAgg = await Task.aggregate([
      { $match: { status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } },
      {
        $lookup: {
          from: 'projects',
          localField: 'projectId',
          foreignField: '_id',
          as: 'p'
        }
      },
      { $unwind: '$p' },
      { $match: { 'p.applicationId': { $in: apps.map((a) => a._id) } } },
      { $group: { _id: '$p.applicationId', c: { $sum: 1 } } }
    ]);
    for (const r of overdueAgg) {
      const key = String(r._id);
      const e = tAgg.get(key) || { total: 0, done: 0, overdueOpen: 0 };
      e.overdueOpen = r.c;
      tAgg.set(key, e);
    }
    return NextResponse.json(
      apps.map((a) => {
        const t = tAgg.get(String(a._id)) || { total: 0, done: 0, overdueOpen: 0 };
        return serialize(a, {
          projectCount: pMap.get(String(a._id)) || 0,
          taskCount: t.total,
          tasksDone: t.done,
          overdueOpen: t.overdueOpen
        });
      })
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'manager', 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Create);
    const exists = await Application.findOne({ key: body.key.toUpperCase() });
    if (exists)
      return NextResponse.json(
        { error: `Application with key ${body.key} already exists` },
        { status: 409 }
      );
    const app = await Application.create({
      ...body,
      key: body.key.toUpperCase(),
      memberIds: body.memberIds || (body.ownerId ? [body.ownerId] : [])
    });
    return NextResponse.json(serialize(app));
  } catch (e) {
    return handleError(e);
  }
}
