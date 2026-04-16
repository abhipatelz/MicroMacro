import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const now = new Date();
    const [
      users,
      teams,
      projects,
      activeProjects,
      tasksOpen,
      tasksOverdue,
      gxpCriticalOpen,
      qaSignoffPending,
      projectsByStatus,
      projectsByLifecycle,
      teams_list
    ] = await Promise.all([
      User.countDocuments(),
      Team.countDocuments(),
      Project.countDocuments(),
      Project.countDocuments({ status: 'in_progress' }),
      Task.countDocuments({ status: { $ne: 'done' } }),
      Task.countDocuments({ status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } }),
      Task.countDocuments({ status: { $ne: 'done' }, gxpCritical: true }),
      Task.countDocuments({
        requiresQaSignoff: true,
        qaSignoffAt: null,
        status: 'done'
      }),
      Project.aggregate([{ $group: { _id: '$status', c: { $sum: 1 } } }]),
      Project.aggregate([{ $group: { _id: '$lifecycle', c: { $sum: 1 } } }]),
      Team.find({}).lean()
    ]);

    const teamProgress: any[] = [];
    for (const t of teams_list) {
      const ps = await Project.find({ teamId: t._id }).select('_id').lean();
      const pids = ps.map((p) => p._id);
      const total = await Task.countDocuments({ projectId: { $in: pids } });
      const done = await Task.countDocuments({ projectId: { $in: pids }, status: 'done' });
      teamProgress.push({ id: String(t._id), name: t.name, tasks: total, done });
    }

    return NextResponse.json({
      totals: {
        users,
        teams,
        projects,
        activeProjects,
        tasksOpen,
        tasksOverdue,
        gxpCriticalOpen,
        qaSignoffPending
      },
      projectsByStatus: projectsByStatus.map((x) => ({ status: x._id, c: x.c })),
      projectsByLifecycle: projectsByLifecycle.map((x) => ({ lifecycle: x._id, c: x.c })),
      teamProgress
    });
  } catch (e) {
    return handleError(e);
  }
}
