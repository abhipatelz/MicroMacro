import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { guardTeamMember } from '@/lib/teamAuth';
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
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    // Membership gate — only admins, the team lead, or explicit members may
    // view this team's board. Without this any authenticated user could
    // enumerate every team's tasks by guessing the team id.
    const denied = await guardTeamMember(params.id, user!.sub, user!.role);
    if (denied) return denied;
    // Personal projects (isPersonal=true) are owner-private — they MUST
    // never surface on a team board even if a stray teamId ended up on the
    // doc. Belt-and-braces: also exclude the PRSN- code prefix, which is
    // the canonical marker.
    const projects = await Project.find({
      teamId: params.id,
      $and: [
        { $or: [{ isPersonal: { $ne: true } }, { isPersonal: { $exists: false } }] },
        { $or: [{ code: { $not: /^PRSN-/ } }, { code: { $exists: false } }] },
      ],
    }).lean();
    const tasks = await Task.find({ projectId: { $in: projects.map((p) => p._id) }, $or: [{ privateToUserId: null }, { privateToUserId: { $exists: false } }, { privateToUserId: user!.sub }] }).lean();
    const users = await User.find({ _id: { $in: tasks.map((t) => t.assigneeId).filter(Boolean) } }).lean();
    const uMap = new Map(users.map((u) => [String(u._id), u.name]));
    const pMap = new Map(projects.map((p) => [String(p._id), p]));

    // Order by CC Target Completion Date (TCD), then due date — nearest
    // deadline first. This is the order the report + board expect; an
    // un-ordered backlog was the complaint from the last review.
    tasks.sort((a, b) => {
      const ad = (a as any).ccTcd ? new Date((a as any).ccTcd).getTime()
        : a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = (b as any).ccTcd ? new Date((b as any).ccTcd).getTime()
        : b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return (STATUS_ORDER[a.status || ''] || 9) - (STATUS_ORDER[b.status || ''] || 9);
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
