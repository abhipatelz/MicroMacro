import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { isLead, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { NOT_PERSONAL } from '@/lib/leadScope';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    if (!isLead(user.role) && user.sub !== params.id) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();
    const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const uid = mongoose.Types.ObjectId.createFromHexString(params.id);
    // Personal projects are owner-only — a lead/admin viewing someone else's
    // year-in-review must never see their personal project names, task titles
    // or any record that lives inside one. Self-views are unrestricted.
    const viewingSelf = user.sub === params.id;

    const completedTasksRaw = await Task.find({
      assigneeId: uid,
      status: 'done',
      completedAt: { $gte: start, $lte: end }
    }).lean();

    const rawProjectIds = [...new Set(completedTasksRaw.map((t) => String(t.projectId)))];
    const projects = await Project.find({
      _id: { $in: rawProjectIds.map((id) => new mongoose.Types.ObjectId(id)) },
      ...(viewingSelf ? {} : NOT_PERSONAL),
    }).select('_id code name lifecycle').lean();
    const pMap = new Map(projects.map((p) => [String(p._id), p]));
    const completedTasks = viewingSelf
      ? completedTasksRaw
      : completedTasksRaw.filter((t) => pMap.has(String(t.projectId)));

    // Subtasks completed by this user within the year (look across all tasks)
    const subtaskHoldersRaw = await Task.find({
      'subtasks.assigneeId': uid,
      'subtasks.completedAt': { $gte: start, $lte: end }
    }).lean();
    const subtaskHolders = viewingSelf
      ? subtaskHoldersRaw
      : subtaskHoldersRaw.filter((t) => pMap.has(String(t.projectId)));
    const completedSubtasks: any[] = [];
    for (const t of subtaskHolders) {
      let p = pMap.get(String(t.projectId));
      if (!p && viewingSelf) {
        p = (await Project.findById(t.projectId).lean()) as any;
        if (p) pMap.set(String(t.projectId), p);
      }
      for (const s of (t as any).subtasks || []) {
        if (
          String(s.assigneeId) === params.id &&
          s.status === 'done' &&
          s.completedAt &&
          s.completedAt >= start &&
          s.completedAt <= end
        ) {
          completedSubtasks.push({
            id: String(s._id),
            title: s.title,
            dueDate: s.dueDate,
            completedAt: s.completedAt,
            daysEarly: s.dueDate
              ? Math.round(
                  (new Date(s.dueDate).getTime() - new Date(s.completedAt).getTime()) / 86400000
                )
              : null,
            taskTitle: t.title,
            projectCode: p?.code,
            projectName: p?.name
          });
        }
      }
    }

    const tasksOut = completedTasks.map((t) => {
      const daysEarly =
        t.dueDate && t.completedAt
          ? Math.round((t.dueDate.getTime() - t.completedAt.getTime()) / 86400000)
          : null;
      const p = pMap.get(String(t.projectId));
      const isBig =
        t.gxpCritical ||
        t.requiresQaSignoff ||
        ['approval', 'audit_finding'].includes(t.taskType || '');
      return {
        id: String(t._id),
        title: t.title,
        taskType: t.taskType,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        daysEarly,
        isBig,
        projectCode: p?.code,
        projectName: p?.name,
        lifecycle: p?.lifecycle
      };
    });

    const bigTasks = tasksOut.filter((t) => t.isBig);
    const earlyTasks = tasksOut.filter((t) => t.daysEarly !== null && t.daysEarly! > 0);
    const earlySubs = completedSubtasks.filter((s) => s.daysEarly !== null && s.daysEarly! > 0);
    const early = [
      ...earlyTasks.map((t) => ({ ...t, kind: 'task' as const })),
      ...earlySubs.map((s) => ({ ...s, kind: 'subtask' as const }))
    ].sort((a, b) => (b.daysEarly || 0) - (a.daysEarly || 0));

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      completed: 0,
      early: 0,
      big: 0
    }));
    for (const t of tasksOut) {
      if (!t.completedAt) continue;
      const m = new Date(t.completedAt).getUTCMonth();
      months[m].completed++;
      if (t.isBig) months[m].big++;
      if (t.daysEarly !== null && t.daysEarly! > 0) months[m].early++;
    }
    for (const s of completedSubtasks) {
      const m = new Date(s.completedAt).getUTCMonth();
      months[m].completed++;
      if (s.daysEarly !== null && s.daysEarly > 0) months[m].early++;
    }

    const extraEffortScore = early.reduce(
      (a: number, x) => a + Math.min(30, x.daysEarly || 0),
      0
    );

    return NextResponse.json({
      year,
      userId: params.id,
      totals: {
        tasksCompleted: tasksOut.length,
        subtasksCompleted: completedSubtasks.length,
        bigTasksCompleted: bigTasks.length,
        earlyCompletions: early.length,
        extraEffortScore
      },
      months,
      bigTasks: bigTasks.slice(0, 25),
      earlyCompletions: early.slice(0, 25)
    });
  } catch (e) {
    return handleError(e);
  }
}
