import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser, isLead } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { TaskCreateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, TaskCreateSchema);

    const scope = await getLeadScope(user!.sub, user!.role);
    const project = await Project.findOne({ _id: body.projectId, ...projectsVisibleFilter(scope) }).select('_id ownerId').lean();
    if (!project) return NextResponse.json({ error: 'Project not found or not accessible' }, { status: 404 });
    // Non-leads may only add tasks to a project they own (their personal project).
    const ownsProject = String((project as any).ownerId || '') === String(user!.sub);
    if (!isLead(user!.role) && !ownsProject) {
      return NextResponse.json(
        { error: 'You can only add tasks to projects you lead or own.' },
        { status: 403 },
      );
    }
    const task = await Task.create({
      projectId: body.projectId,
      phaseId: body.phaseId,
      title: body.title,
      description: body.description || '',
      assigneeId: body.assigneeId || undefined,
      priority: body.priority || 'medium',
      taskType: body.taskType || 'task',
      gxpCritical: !!body.gxpCritical,
      requiresQaSignoff: !!body.requiresQaSignoff,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      estimatedHours: body.estimatedHours,
      ccNo:           body.ccNo           || '',
      ccTcd:          body.ccTcd ? new Date(body.ccTcd) : undefined,
      documentNo:     body.documentNo     || '',
      applicableSite: body.applicableSite || 'na',
      deployStage:    body.deployStage    || 'na',
      remarks:        body.remarks        || '',
    });

    // Tell the assignee they have new work (unless they assigned it to
    // themselves).
    if (body.assigneeId) {
      await notify({
        userId:    String(body.assigneeId),
        actorId:   user!.sub,
        type:      'task_assigned',
        title:     'New task assigned to you',
        body:      task.title,
        taskId:    String(task._id),
        projectId: String(body.projectId),
      });
    }

    return NextResponse.json(taskS(task));
  } catch (e) {
    return handleError(e);
  }
}
