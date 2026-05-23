import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { project as projectS } from '@/lib/serialize';

export const runtime = 'nodejs';

// Toggle a project's archived state. Archiving is reversible — the
// document and its tasks stay in the database for audit purposes, only
// hidden from default listings. Body { archived: boolean }.
//
// Lead/pm/admin only because flipping the flag changes visibility for
// every team member and counts as a workspace-level decision.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const archived = body?.archived === true;

    const project = await Project.findById(params.id);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    project.archived   = archived;
    project.archivedAt = archived ? new Date() : null;
    (project as any).archivedBy = archived ? (user!.sub as any) : null;
    await project.save();

    return NextResponse.json({ ok: true, project: projectS(project) });
  } catch (e) {
    return handleError(e);
  }
}
