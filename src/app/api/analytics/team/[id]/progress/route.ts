import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { isLead, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { projectRef } from '@/lib/projectRef';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();
    const team = await Team.findById(params.id).select('memberIds').lean();
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const projects = await Project.find({ teamId: params.id })
      .select('code ccNo name status lifecycle dueDate')
      .lean();
    const projectIds = projects.map((p) => p._id);
    const now = new Date();
    const memberIds = (team as any).memberIds || [];

    const [taskAgg, memberAgg, users] = await Promise.all([
      Task.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: { projectId: '$projectId', status: '$status' }, c: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { projectId: { $in: projectIds }, assigneeId: { $in: memberIds } } },
        {
          $group: {
            _id: '$assigneeId',
            assigned: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$status', 'done'] },
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      User.find({ _id: { $in: memberIds } })
        .select('name title')
        .lean(),
    ]);

    const pMap = new Map<string, any>();
    for (const p of projects) pMap.set(String(p._id), { ...p, taskCount: 0, tasksDone: 0 });
    for (const r of taskAgg) {
      const e = pMap.get(String(r._id.projectId));
      if (!e) continue;
      e.taskCount += r.c;
      if (r._id.status === 'done') e.tasksDone += r.c;
    }

    const statMap = new Map(memberAgg.map((r: any) => [String(r._id), r]));
    const memberStats = users.map((u: any) => {
      const s: any = statMap.get(String(u._id)) || { assigned: 0, done: 0, overdue: 0 };
      return {
        id: String(u._id),
        name: u.name,
        title: u.title,
        assigned: s.assigned || 0,
        done: s.done || 0,
        overdue: s.overdue || 0,
      };
    });

    return NextResponse.json({
      projects: [...pMap.values()].map((p) => ({
        id: String(p._id),
        code: projectRef(p),
        name: p.name,
        status: p.status,
        lifecycle: p.lifecycle,
        dueDate: p.dueDate,
        taskCount: p.taskCount,
        tasksDone: p.tasksDone,
      })),
      members: memberStats,
    });
  } catch (e) {
    return handleError(e);
  }
}
