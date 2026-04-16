import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { team as teamS, u, project as projectS } from '@/lib/serialize';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const t = await Team.findById(params.id).lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const memberIds = ((t as any).memberIds || []);
    const users = await User.find({ _id: { $in: memberIds } }).lean();
    const projects = await Project.find({ teamId: params.id }).lean();
    const taskCounts = await Task.aggregate([
      { $match: { projectId: { $in: projects.map((p) => p._id) } } },
      { $group: { _id: { projectId: '$projectId', status: '$status' }, c: { $sum: 1 } } }
    ]);
    const projectAgg = new Map<string, { total: number; done: number }>();
    for (const c of taskCounts) {
      const key = String(c._id.projectId);
      const e = projectAgg.get(key) || { total: 0, done: 0 };
      e.total += c.c;
      if (c._id.status === 'done') e.done += c.c;
      projectAgg.set(key, e);
    }

    return NextResponse.json({
      ...teamS(t),
      members: users.map(u),
      projects: projects.map((p) => {
        const agg = projectAgg.get(String(p._id));
        return projectS(p, {
          taskCount: agg?.total || 0,
          tasksDone: agg?.done || 0
        });
      })
    });
  } catch (e) {
    return handleError(e);
  }
}
