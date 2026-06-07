import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { project as projectS } from '@/lib/serialize';
import { bustDashboardCache } from '@/lib/leadDashboard';
import { bustProjectsPageCache } from '@/lib/projectList';
import { NOT_PERSONAL } from '@/lib/leadScope';

export const runtime = 'nodejs';

const Body = z.object({ archived: z.boolean() });

// Toggle a project's archived state. Archiving is reversible — the
// document and its tasks stay in the database for audit purposes, only
// hidden from default listings. Body { archived: boolean }.
//
// Lead/pm/admin only because flipping the flag changes visibility for
// every team member and counts as a workspace-level decision.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'admin');
    if (error) return error;

    // Guard against a CastError 500 on malformed IDs (anything not a
    // 24-char hex string would otherwise crash the route).
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    const { archived } = await readBody(req, Body);
    await connectDB();

    // Personal projects are invisible to admins by design — archiving (or even
    // confirming the existence of) one must behave exactly like a 404.
    const updated = await Project.findOneAndUpdate(
      { _id: params.id, ...NOT_PERSONAL },
      {
        $set: {
          archived,
          archivedAt: archived ? new Date() : null,
          archivedBy: archived ? user!.sub : null,
        },
      },
      { new: true },
    );
    if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json({ ok: true, project: projectS(updated) });
  } catch (e) {
    return handleError(e);
  }
}
