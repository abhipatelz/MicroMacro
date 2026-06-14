import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Notification } from '@/models/Notification';
import { TaskFlowEvent } from '@/models/TaskFlowEvent';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { isLead, requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS, task as taskS } from '@/lib/serialize';
import { LIFECYCLES } from '@/lib/lifecycles';
import { ProjectUpdateSchema, DeleteProjectSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { getProjectDetail } from '@/lib/projectDetail';
import { logOperation } from '@/lib/audit';
import { bustDashboardCache } from '@/lib/leadDashboard';
import { bustProjectsPageCache } from '@/lib/projectList';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    // Single source of truth shared with the server-rendered page.
    const detail = await getProjectDetail(params.id, user!.sub, user!.role);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user!.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();
    const scope = await getLeadScope(user!.sub, user!.role);
    const body = await readBody(req, ProjectUpdateSchema);
    const { password, remarks, ...updates } = body;
    const current = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) })
      .select('status isPersonal code ccNo refLabel')
      .lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isShared = !(
      (current as any).isPersonal || String((current as any).code || '').startsWith('PRSN-')
    );
    const statusChanging = !!updates.status && updates.status !== (current as any).status;

    // A status change on a shared (GxP) project is a controlled action: it
    // requires a re-authenticated e-signature with a reason, recorded in the
    // immutable audit trail (21 CFR Part 11 §11.10/§11.50).
    if (statusChanging && isShared) {
      if (!password) {
        return NextResponse.json(
          { error: 'Your password is required to sign this status change.' },
          { status: 400 },
        );
      }
      if (!remarks || !remarks.trim()) {
        return NextResponse.json(
          { error: 'A reason is required to sign this status change.' },
          { status: 400 },
        );
      }
      const signer = await User.findById(user!.sub).select('passwordHash').lean();
      if (!signer || !bcrypt.compareSync(password, (signer as any).passwordHash)) {
        return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
      }
    }

    // Block marking completed when open tasks remain
    if (updates.status === 'completed') {
      const openCount = await Task.countDocuments({ projectId: params.id, status: { $ne: 'done' } });
      if (openCount > 0) {
        return NextResponse.json(
          { error: `${openCount} task${openCount === 1 ? '' : 's'} still open — mark them done first` },
          { status: 422 },
        );
      }
    }

    const patch: any = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      if (['startDate', 'dueDate'].includes(k)) {
        patch[k] = v ? new Date(v as string) : null;
      } else {
        patch[k] = v;
      }
    }
    if (updates.status === 'completed' && (current as any).status !== 'completed') {
      patch.completedAt = new Date();
    } else if (updates.status && updates.status !== 'completed') {
      patch.completedAt = null;
    }
    await Project.updateOne({ _id: params.id }, { $set: patch });
    const fresh = await Project.findById(params.id).lean();

    const ccNoChanging = updates.ccNo !== undefined && updates.ccNo !== ((current as any).ccNo || '');
    if (isShared) {
      // The reference label is per-project ("CC#", "SOP#", …) so the audit
      // entry names the scheme the team actually uses.
      const refLabel = (updates.refLabel ?? (current as any).refLabel) || 'Ref #';
      const meta: Record<string, any> = {};
      if (ccNoChanging) {
        // GxP identifier change: record exact before/after values.
        meta.ccNo = { before: (current as any).ccNo || '', after: updates.ccNo };
      }
      if (remarks) meta.remarks = remarks.trim();
      await logOperation({
        action: ccNoChanging ? 'project.ccno' : statusChanging ? 'project.status' : 'project.update',
        category: 'project',
        actor: user,
        targetType: 'project',
        targetId: params.id,
        targetLabel: (fresh as any)?.name || '',
        summary: ccNoChanging
          ? `Project ${refLabel} changed: "${(current as any).ccNo || '—'}" → "${updates.ccNo}"`
          : statusChanging
            ? `Project status → ${updates.status}${remarks ? ` — ${remarks.trim()}` : ''}`
            : 'Updated project details',
        meta,
      });
    }

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json(projectS(fresh));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Deleting a project is destructive + irreversible. Shared projects → admin
    // only; a personal project can only ever be deleted by its owner (no one
    // else can even see it).
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const scope = await getLeadScope(user!.sub, user!.role);
    const existing = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) })
      .select('_id name isPersonal personal ownerId')
      .lean();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwner = String((existing as any).ownerId) === user!.sub;
    const isAdminRole = user!.role === 'admin' || user!.role === 'master_admin';
    // Admins can delete any project; project owners (including leads) can
    // delete their own project (shared or personal) after password re-auth.
    if (!isAdminRole && !isOwner) {
      return NextResponse.json(
        { error: 'Only the project owner or an admin can delete this project.' },
        { status: 403 },
      );
    }

    const body = await readBody(req, DeleteProjectSchema);
    const pmUser = await User.findById(user!.sub).select('passwordHash').lean();
    if (!pmUser || !bcrypt.compareSync(body.password, (pmUser as any).passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const existingFull = await Project.findById(params.id).select('isPersonal code').lean();
    // Cascade: remove the project's tasks and every record that references
    // them or the project, so nothing dangles after the delete.
    const doomedTaskIds = (await Task.find({ projectId: params.id }, '_id').lean()).map((t: any) =>
      String(t._id),
    );
    await Task.deleteMany({ projectId: params.id });
    await Notification.deleteMany({
      $or: [{ projectId: params.id }, { taskId: { $in: doomedTaskIds } }],
    });
    await TaskFlowEvent.deleteMany({ taskId: { $in: doomedTaskIds } });
    await Project.deleteOne({ _id: params.id });

    if (
      !((existingFull as any)?.isPersonal || String((existingFull as any)?.code || '').startsWith('PRSN-'))
    ) {
      await logOperation({
        action: 'project.delete',
        category: 'project',
        actor: user!,
        targetType: 'project',
        targetId: params.id,
        targetLabel: (existing as any)?.name || '',
        summary: `Deleted project ${(existing as any)?.name || ''}`.trim(),
      });
    }

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
