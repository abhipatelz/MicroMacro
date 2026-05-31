import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { AuditLog } from '@/models/AuditLog';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(parseInt(searchParams.get('year') || '') || currentYear, 2020), currentYear + 1);
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    const userOid = new mongoose.Types.ObjectId(user!.sub);

    const [activityRows, totalDone, streak40, projectHeroCount, recentRows] = await Promise.all([
      // All audit log entries by this user per day
      AuditLog.aggregate([
        { $match: { actorId: userOid, createdAt: { $gte: startDate, $lt: endDate } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      // Total tasks completed ever
      Task.countDocuments({ assigneeId: userOid, status: 'done' }),
      // Activity days in last 40 days for streak
      AuditLog.aggregate([
        { $match: { actorId: userOid, createdAt: { $gte: new Date(Date.now() - 40 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
      ]).then((r: any[]) => new Set(r.map(x => x._id as string))),
      // Tasks done in completed projects
      Task.aggregate([
        { $match: { assigneeId: userOid, status: 'done' } },
        { $lookup: { from: 'projects', localField: 'projectId', foreignField: '_id', as: 'proj' } },
        { $match: { 'proj.status': 'completed', 'proj.isPersonal': { $ne: true } } },
        { $count: 'c' },
      ]).then((r: any[]) => r[0]?.c || 0),
      // A readable feed of this user's most recent contributions, so the
      // activity card shows *what* they did, not just a heatmap.
      AuditLog.find({ actorId: userOid })
        .sort({ createdAt: -1 })
        .limit(15)
        .select('action category summary createdAt')
        .lean(),
    ]);

    const recent = (recentRows as any[]).map((r) => ({
      id:        String(r._id),
      action:    r.action || '',
      category:  r.category || 'general',
      summary:   r.summary || '',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    }));

    const days: Record<string, number> = {};
    for (const r of activityRows) days[r._id] = r.count;

    // Streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 40; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (streak40.has(key)) streak++;
      else if (i > 0) break;
    }

    // Badges
    const badges: string[] = ['first_step']; // always earned
    if (totalDone >= 1) badges.push('task_rookie');
    if (totalDone >= 10) badges.push('task_achiever');
    if (totalDone >= 50) badges.push('task_performer');
    if (totalDone >= 100) badges.push('task_champion');
    if (projectHeroCount > 0) badges.push('project_hero');
    if (streak >= 3) badges.push('streak_3');
    if (streak >= 7) badges.push('streak_7');

    return NextResponse.json({ year, days, badges, streak, totalTasksDone: totalDone, recent });
  } catch (e) {
    return handleError(e);
  }
}
