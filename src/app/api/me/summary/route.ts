import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const userId = user.sub;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const agg = await Task.aggregate([
      { $match: { assigneeId: { $exists: true } } },
      { $match: { assigneeId: { $eq: (await import('mongoose')).default.Types.ObjectId.createFromHexString(userId) } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', 'done'] },
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', now] }
                  ]
                },
                1,
                0
              ]
            }
          },
          dueThisWeek: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', 'done'] },
                    { $ne: ['$dueDate', null] },
                    { $gte: ['$dueDate', now] },
                    { $lte: ['$dueDate', in7] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);
    const byStatus = await Task.aggregate([
      {
        $match: {
          assigneeId: (await import('mongoose')).default.Types.ObjectId.createFromHexString(userId)
        }
      },
      { $group: { _id: '$status', c: { $sum: 1 } } }
    ]);
    const a = agg[0] || { total: 0, done: 0, overdue: 0, dueThisWeek: 0 };
    return NextResponse.json({
      totalAssigned: a.total,
      completed: a.done,
      overdue: a.overdue,
      dueThisWeek: a.dueThisWeek,
      completionRate: a.total ? Math.round((a.done / a.total) * 100) : 0,
      byStatus: Object.fromEntries(byStatus.map((x) => [x._id, x.c]))
    });
  } catch (e) {
    return handleError(e);
  }
}
