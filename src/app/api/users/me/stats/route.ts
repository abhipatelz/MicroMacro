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
      completedTasks
    ] = await Promise.all([
      Task.countDocuments({ assigneeId: uid, status: 'done' }),
      Task.countDocuments({ assigneeId: uid, status: 'done', completedAt: { $gte: startOfMonth } }),
      Task.countDocuments({ assigneeId: uid, status: 'done', completedAt: { $gte: startOfYear  } }),
      Task.countDocuments({ assigneeId: uid, status: { $ne: 'done' } }),
      Task.countDocuments({ assigneeId: uid, status: { $ne: 'done' }, dueDate: { $lt: now } }),
      Task.countDocuments({ assigneeId: uid, status: 'done', gxpCritical: true }),
      Task.distinct('projectId', { assigneeId: uid }),
      Task.find({ assigneeId: uid })
        .select('status completedAt createdAt updatedAt dueDate')
        .lean(),
    ]);

    const projectCount = await Project.countDocuments({ _id: { $in: projectIds } });

    const last180d = new Date(now);
    last180d.setDate(last180d.getDate() - 179);
    last180d.setHours(0, 0, 0, 0);

    const dayCounts = new Map<string, number>();
    for (let d = new Date(last180d); d <= now; d.setDate(d.getDate() + 1)) {
      dayCounts.set(d.toISOString().slice(0, 10), 0);
    }
    for (const t of completedTasks as any[]) {
      const bump = (dt?: Date | string | null, weight = 1) => {
        if (!dt) return;
        const day = new Date(dt).toISOString().slice(0, 10);
        if (!dayCounts.has(day)) return;
        dayCounts.set(day, (dayCounts.get(day) || 0) + weight);
      };
      // Productivity events (weighted): completion, touches, and due-date action.
      bump(t.completedAt, 3);
      bump(t.updatedAt, 1);
      if (t.status === 'done') bump(t.createdAt, 1);
      bump(t.dueDate, 1);
    }

    return NextResponse.json({
      totalDone, doneThisMonth, doneThisYear,
      openTasks, overdueTasks,
      gxpDone, projectCount,
      activity: Array.from(dayCounts.entries()).map(([date, count]) => ({ date, count })),
    });
  } catch (e) {
    return handleError(e);
  }
}
