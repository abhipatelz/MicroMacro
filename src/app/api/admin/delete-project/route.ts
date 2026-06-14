import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromCookie, isAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Notification } from '@/models/Notification';
import { TaskFlowEvent } from '@/models/TaskFlowEvent';
import { User } from '@/models/User';
import { logOperation } from '@/lib/audit';
import { NOT_PERSONAL } from '@/lib/leadScope';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const runtime = 'nodejs';

const Schema = z.object({
  code: z.string().min(1),
  reason: z.string().min(20, 'Reason must be at least 20 characters'),
  password: z.string().min(1, 'Password is required'),
});

export async function DELETE(req: NextRequest) {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(jwt.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  await connectDB();

  // Verify admin password
  const admin = await User.findById(jwt.sub).select('passwordHash').lean();
  if (!admin || !bcrypt.compareSync(parsed.data.password, (admin as any).passwordHash)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  // Find project by reference code. Personal projects are excluded entirely —
  // they are invisible to admins by design, so a lookup must behave exactly as
  // if the project doesn't exist (same generic 404, no existence leak).
  const codeUpper = parsed.data.code.toUpperCase();
  const project = await Project.findOne({ $and: [{ code: codeUpper }, NOT_PERSONAL] }).lean();
  if (!project) {
    return NextResponse.json(
      { error: `No project found with reference code "${codeUpper}"` },
      { status: 404 },
    );
  }

  const projectId = String((project as any)._id);

  // Delete all tasks in the project, cascading to every record that points at
  // them or at the project — notifications and flow events — so nothing is
  // left dangling (a notification deep-linking a deleted task would 404).
  const taskIds = (await Task.find({ projectId }, '_id').lean()).map((t: any) => String(t._id));
  const deletedTasks = await Task.deleteMany({ projectId });
  await Notification.deleteMany({ $or: [{ projectId }, { taskId: { $in: taskIds } }] });
  await TaskFlowEvent.deleteMany({ taskId: { $in: taskIds } });

  // Delete the project itself
  await Project.deleteOne({ _id: (project as any)._id });

  // Write audit entry
  await logOperation({
    action: 'project.admin_delete',
    category: 'project',
    actor: { id: jwt.sub, name: jwt.name || jwt.email },
    targetType: 'project',
    targetId: projectId,
    targetLabel: (project as any).name,
    summary: `Admin deleted project ${(project as any).code} — ${parsed.data.reason}`,
    meta: {
      code: (project as any).code,
      reason: parsed.data.reason,
      tasksDeleted: deletedTasks.deletedCount,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `Project "${(project as any).name}" and ${deletedTasks.deletedCount} task${deletedTasks.deletedCount === 1 ? '' : 's'} permanently deleted.`,
  });
}
