import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
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
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
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
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!isLead(user!.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();
    const scope = await getLeadScope(user!.sub, user!.role);
    const body = await readBody(req, ProjectUpdateSchema);
    const current = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) }).select('status').lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Block marking completed when open tasks remain
    if (body.status === 'completed') {
      const openCount = await Task.countDocuments({ projectId: params.id, status: { $ne: 'done' } });
      if (openCount > 0) {
        return NextResponse.json(
          { error: `${openCount} task${openCount === 1 ? '' : 's'} still open — mark them done first` },
          { status: 422 },
        );
      }
    }

    const patch: any = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (['startDate', 'dueDate'].includes(k)) {
        patch[k] = v ? new Date(v as string) : null;
      } else {
        patch[k] = v;
      }
    }
    if (body.status === 'completed' && current.status !== 'completed') {
      patch.completedAt = new Date();
    } else if (body.status && body.status !== 'completed') {
      patch.completedAt = null;
    }
    await Project.updateOne({ _id: params.id }, { $set: patch });
    const fresh = await Project.findById(params.id).lean();

    const statusChanged = !!body.status && body.status !== current.status;
    if (!((fresh as any)?.isPersonal || String((fresh as any)?.code || '').startsWith('PRSN-'))) {
      await logOperation({
        action: statusChanged ? 'project.status' : 'project.update', category: 'project', actor: user,
        targetType: 'project', targetId: params.id, targetLabel: (fresh as any)?.name || '',
        summary: statusChanged ? `Project status → ${body.status}` : 'Updated project details',
      });
    }

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
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await connectDB();

    const scope = await getLeadScope(user!.sub, user!.role);
    const existing = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) })
      .select('_id name isPersonal personal ownerId').lean();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ownsPersonal = !!(((existing as any).isPersonal || (existing as any).personal) && String((existing as any).ownerId) === user!.sub);
    if (!ownsPersonal && user!.role !== 'admin') {
      return NextResponse.json({ error: 'Only an admin can delete a shared project.' }, { status: 403 });
    }

    const body = await readBody(req, DeleteProjectSchema);
    const pmUser = await User.findById(user!.sub).select('passwordHash').lean();
    if (!pmUser || !bcrypt.compareSync(body.password, (pmUser as any).passwordHash)) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    const existingFull = await Project.findById(params.id).select('isPersonal code').lean();
    await Task.deleteMany({ projectId: params.id });
    await Project.deleteOne({ _id: params.id });

    if (!((existingFull as any)?.isPersonal || String((existingFull as any)?.code || '').startsWith('PRSN-'))) {
      await logOperation({
        action: 'project.delete', category: 'project', actor: user!,
        targetType: 'project', targetId: params.id, targetLabel: (existing as any)?.name || '',
        summary: `Deleted project ${(existing as any)?.name || ''}`.trim(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
