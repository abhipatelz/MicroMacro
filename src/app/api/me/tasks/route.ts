import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';

export const runtime = 'nodejs';

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4
};

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const userId = user.sub;

    const [tasks, allProjects] = await Promise.all([
      Task.find({ assigneeId: userId }).lean(),
      Project.find({}).select('_id code name lifecycle').lean()
    ]);
    const pMap = new Map(allProjects.map((p) => [String(p._id), p]));

    const sortedTasks = tasks.sort((a, b) => {
      const s = (STATUS_ORDER[a.status || ''] || 9) - (STATUS_ORDER[b.status || ''] || 9);
      if (s !== 0) return s;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });

    // collect subtasks assigned to the user too
    const subtaskHolders = await Task.find({ 'subtasks.assigneeId': userId }).lean();
    const subtasks: any[] = [];
    for (const t of subtaskHolders) {
      const p = pMap.get(String(t.projectId));
      for (const s of (t as any).subtasks || []) {
        if (String(s.assigneeId) === userId) {
          subtasks.push({
            id: String(s._id),
            title: s.title,
            status: s.status,
            dueDate: s.dueDate,
            completedAt: s.completedAt,
            taskTitle: t.title,
            taskId: String(t._id),
            projectCode: p?.code,
            projectName: p?.name
          });
        }
      }
    }

    return NextResponse.json({
      tasks: sortedTasks.map((t) => {
        const p = pMap.get(String(t.projectId));
        return taskS(t, {
          projectCode: p?.code,
          projectName: p?.name,
          lifecycle: p?.lifecycle,
          subtaskCount: ((t as any).subtasks || []).length,
          subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length
        });
      }),
      subtasks
    });
  } catch (e) {
    return handleError(e);
  }
}
