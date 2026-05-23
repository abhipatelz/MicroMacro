import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS } from '@/lib/serialize';
import { LIFECYCLES, LifecycleKey } from '@/lib/lifecycles';
import { ProjectCreateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const scope = await getLeadScope(user!.sub, user!.role);
    const visibilityFilter = projectsVisibleFilter(scope);

    const { searchParams } = req.nextUrl;
    const q: any = { ...visibilityFilter };

    // Archived projects are hidden by default — pass ?includeArchived=1
    // to retrieve them, or ?archived=1 to fetch *only* the archive bin.
    const includeArchived = searchParams.get('includeArchived') === '1';
    const archivedOnly    = searchParams.get('archived') === '1';
    if (archivedOnly)             q.archived = true;
    else if (!includeArchived)    q.archived = { $ne: true };

    const teamId = searchParams.get('teamId');
    if (teamId) q.teamId = teamId;
    const statuses = searchParams.getAll('status');
    if (statuses.length === 1) q.status = statuses[0];
    else if (statuses.length > 1) q.status = { $in: statuses };
    const lifecycle = searchParams.get('lifecycle');
    if (lifecycle) q.lifecycle = lifecycle;
    const term = searchParams.get('q');
    if (term) {
      q.$and = [
        visibilityFilter,
        { $or: [
          { name: { $regex: term, $options: 'i' } },
          { code: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } }
        ] }
      ];
      delete q.$or;
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
    const { error, user } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, ProjectCreateSchema);
    const lc = LIFECYCLES[body.lifecycle as LifecycleKey] || LIFECYCLES.generic;
    const code =
      body.code ||
      `${(body.lifecycle || 'generic').toUpperCase()}-${new Date().getFullYear()}-${String(
        (await Project.countDocuments({})) + 1
      ).padStart(4, '0')}`;

    // Use customPhases if provided, otherwise fall back to lifecycle template
    const sourcePhases = body.customPhases && body.customPhases.length > 0
      ? body.customPhases.map((ph, i) => ({ name: ph.name || `Stage ${i + 1}`, tasks: ph.tasks }))
      : lc.phases.map(ph => ({ name: ph.name, tasks: ph.tasks.map(t => t.title) }));

    const phaseDocs = sourcePhases.map((ph, i) => ({
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
      teamId: body.teamId || undefined,
      ownerId: body.ownerId || user.sub,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      gxpImpact: body.gxpImpact || 'none',
      regulatoryRefs: lc.regulatoryRefs,
      phases: phaseDocs
    });

    // Seed tasks from custom or template phases
    const taskDocs: any[] = [];
    sourcePhases.forEach((ph, i) => {
      for (const title of ph.tasks) {
        if (title.trim()) {
          taskDocs.push({
            projectId: project._id,
            phaseId: phaseDocs[i]._id,
            title: title.trim(),
            taskType: 'task',
            priority: body.priority || 'medium'
          });
        }
      }
    });
    if (taskDocs.length) await Task.insertMany(taskDocs);

    return NextResponse.json(projectS(project));
  } catch (e) {
    return handleError(e);
  }
}
