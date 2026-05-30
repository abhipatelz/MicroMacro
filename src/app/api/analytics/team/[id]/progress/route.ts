import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { isLead, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();
    const team = await Team.findById(params.id).lean();
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const projects = await Project.find({ teamId: params.id }).lean();
    const taskAgg = await Task.aggregate([
      { $match: { projectId: { $in: projects.map((p) => p._id) } } },
      { $group: { _id: { projectId: '$projectId', status: '$status' }, c: { $sum: 1 } } }
    ]);
    const pMap = new Map<string, any>();
    for (const p of projects) pMap.set(String(p._id), { ...p, taskCount: 0, tasksDone: 0 });
    for (const r of taskAgg) {
      const e = pMap.get(String(r._id.projectId));
      if (!e) continue;
      e.taskCount += r.c;
      if (r._id.status === 'done') e.tasksDone += r.c;
    }

    const now = new Date();
    const memberIds = (team as any).memberIds || [];
    const users = await User.find({ _id: { $in: memberIds } }).lean();
    const memberStats = await Promise.all(
      users.map(async (u) => {
        const assigned = await Task.countDocuments({
          assigneeId: u._id,
          projectId: { $in: projects.map((p) => p._id) }
        });
        const done = await Task.countDocuments({
          assigneeId: u._id,
          status: 'done',
          projectId: { $in: projects.map((p) => p._id) }
        });
        const overdue = await Task.countDocuments({
          assigneeId: u._id,
          status: { $ne: 'done' },
          dueDate: { $ne: null, $lt: now },
          projectId: { $in: projects.map((p) => p._id) }
        });
        return {
          id: String(u._id),
          name: u.name,
          title: u.title,
          assigned,
          done,
          overdue
        };
      })
    );

    return NextResponse.json({
      projects: [...pMap.values()].map((p) => ({
        id: String(p._id),
        code: p.code,
        name: p.name,
        status: p.status,
        lifecycle: p.lifecycle,
        dueDate: p.dueDate,
        taskCount: p.taskCount,
        tasksDone: p.tasksDone
      })),
      members: memberStats
    });
  } catch (e) {
    return handleError(e);
  }
}
