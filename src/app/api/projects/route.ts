import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS } from '@/lib/serialize';
import { LIFECYCLES, LifecycleKey } from '@/lib/lifecycles';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Create = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  lifecycle: z.enum([
    'csv',
    'sop',
    'deviation_capa',
    'change_control',
    'audit',
    'validation',
    'data_integrity',
    'pharmacovigilance',
    'generic'
  ]).default('generic'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  applicationId: z.string().optional(),
  teamId: z.string().optional(),
  ownerId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  gxpImpact: z.enum(['none', 'low', 'medium', 'high']).optional(),
  useTemplate: z.boolean().default(true)
});

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { searchParams } = req.nextUrl;
    const q: any = {};
    const teamId = searchParams.get('teamId');
    if (teamId) q.teamId = teamId;
    const applicationId = searchParams.get('applicationId');
    if (applicationId) q.applicationId = applicationId;
    const status = searchParams.get('status');
    if (status) q.status = status;
    const lifecycle = searchParams.get('lifecycle');
    if (lifecycle) q.lifecycle = lifecycle;
    const term = searchParams.get('q');
    if (term) {
      q.$or = [
        { name: { $regex: term, $options: 'i' } },
        { code: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } }
      ];
    }
    const projects = await Project.find(q).sort({ createdAt: -1 }).lean();
    const teams = await Team.find({ _id: { $in: projects.map((p) => p.teamId).filter(Boolean) } }).lean();
    const owners = await User.find({ _id: { $in: projects.map((p) => p.ownerId).filter(Boolean) } }).lean();
    const taskAgg = await Task.aggregate([
      { $match: { projectId: { $in: projects.map((p) => p._id) } } },
      { $group: { _id: { projectId: '$projectId', status: '$status' }, c: { $sum: 1 } } }
    ]);
    const tMap = new Map(teams.map((t) => [String(t._id), t.name]));
    const oMap = new Map(owners.map((o) => [String(o._id), o.name]));
    const agg = new Map<string, { total: number; done: number }>();
    for (const r of taskAgg) {
      const key = String(r._id.projectId);
      const e = agg.get(key) || { total: 0, done: 0 };
      e.total += r.c;
      if (r._id.status === 'done') e.done += r.c;
      agg.set(key, e);
    }
    return NextResponse.json(
      projects.map((p) =>
        projectS(p, {
          teamName: tMap.get(String(p.teamId)) || null,
          ownerName: oMap.get(String(p.ownerId)) || null,
          taskCount: agg.get(String(p._id))?.total || 0,
          tasksDone: agg.get(String(p._id))?.done || 0
        })
      )
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Create);
    const lc = LIFECYCLES[body.lifecycle as LifecycleKey] || LIFECYCLES.generic;
    const code =
      body.code ||
      `${(body.lifecycle || 'generic').toUpperCase()}-${new Date().getFullYear()}-${String(
        (await Project.countDocuments({})) + 1
      ).padStart(4, '0')}`;

    const phaseDocs = lc.phases.map((ph, i) => ({
      _id: new mongoose.Types.ObjectId(),
      name: ph.name,
      position: i
    }));

    const project = await Project.create({
      code,
      name: body.name,
      description: body.description || '',
      lifecycle: body.lifecycle,
      priority: body.priority || 'medium',
      applicationId: body.applicationId || undefined,
      teamId: body.teamId || undefined,
      ownerId: body.ownerId || user.sub,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      gxpImpact: body.gxpImpact || 'none',
      regulatoryRefs: lc.regulatoryRefs,
      phases: phaseDocs
    });

    if (body.useTemplate) {
      const taskDocs: any[] = [];
      lc.phases.forEach((ph, i) => {
        for (const t of ph.tasks) {
          taskDocs.push({
            projectId: project._id,
            phaseId: phaseDocs[i]._id,
            title: t.title,
            taskType: t.type,
            gxpCritical: !!t.gxp,
            requiresQaSignoff: !!t.qa,
            priority: body.priority || 'medium'
          });
        }
      });
      if (taskDocs.length) await Task.insertMany(taskDocs);
    }

    return NextResponse.json(projectS(project));
  } catch (e) {
    return handleError(e);
  }
}
