import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const uid = user.sub;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const [
      totalDone, doneThisMonth, doneThisYear,
      openTasks, overdueTasks,
      gxpDone, projectIds,
    ] = await Promise.all([
      Task.countDocuments({ assigneeId: uid, status: 'done' }),
      Task.countDocuments({ assigneeId: uid, status: 'done', completedAt: { $gte: startOfMonth } }),
      Task.countDocuments({ assigneeId: uid, status: 'done', completedAt: { $gte: startOfYear  } }),
      Task.countDocuments({ assigneeId: uid, status: { $ne: 'done' } }),
      Task.countDocuments({ assigneeId: uid, status: { $ne: 'done' }, dueDate: { $lt: now } }),
      Task.countDocuments({ assigneeId: uid, status: 'done', gxpCritical: true }),
      Task.distinct('projectId', { assigneeId: uid }),
    ]);

    const projectCount = await Project.countDocuments({ _id: { $in: projectIds } });

    return NextResponse.json({
      totalDone, doneThisMonth, doneThisYear,
      openTasks, overdueTasks,
      gxpDone, projectCount,
    });
  } catch (e) {
    return handleError(e);
  }
}
