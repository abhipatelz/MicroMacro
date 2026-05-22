import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { TaskCreateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, TaskCreateSchema);

    const scope = await getLeadScope(user!.sub);
    const project = await Project.findOne({ _id: body.projectId, ...projectsVisibleFilter(scope) }).select('_id').lean();
    if (!project) return NextResponse.json({ error: 'Project not found or not accessible' }, { status: 404 });
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
    return NextResponse.json(taskS(task));
  } catch (e) {
    return handleError(e);
  }
}
