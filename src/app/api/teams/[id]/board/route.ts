import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { requireUser, isLead } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';

export const runtime = 'nodejs';

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  review: 1,
  blocked: 2,
  todo: 3,
  done: 4
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const projects = await Project.find({ teamId: params.id }).lean();
    const taskQuery: any = { projectId: { $in: projects.map((p) => p._id) } };
    if (!isLead(user.role)) taskQuery.assigneeId = user.sub;
    const tasks = await Task.find(taskQuery).lean();
    const users = await User.find({ _id: { $in: tasks.map((t) => t.assigneeId).filter(Boolean) } }).lean();
    const uMap = new Map(users.map((u) => [String(u._id), u.name]));
    const pMap = new Map(projects.map((p) => [String(p._id), p]));

    tasks.sort((a, b) => {
      const s = (STATUS_ORDER[a.status || ''] || 9) - (STATUS_ORDER[b.status || ''] || 9);
      if (s !== 0) return s;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });

    return NextResponse.json(
      tasks.map((t) => {
        const p = pMap.get(String(t.projectId));
        return taskS(t, {
          projectCode: p?.code,
          projectName: p?.name,
          lifecycle: p?.lifecycle,
          assigneeName: t.assigneeId ? uMap.get(String(t.assigneeId)) : null,
          subtaskCount: ((t as any).subtasks || []).length,
          subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length
        });
      })
    );
  } catch (e) {
    return handleError(e);
  }
}
