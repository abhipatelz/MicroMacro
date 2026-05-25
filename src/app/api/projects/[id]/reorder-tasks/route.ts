import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

export const runtime = 'nodejs';

const Body = z.object({
  // Task IDs in their new order. Index becomes the task's `position`.
  orderedIds: z.array(z.string()).min(1).max(500),
});

/**
 * Persist a manual reshuffle of tasks (within a phase) on the by-phase
 * project view. Lead/pm/admin only; the project must be in the caller's
 * scope. We write position = array index so the order is exact and stable.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }
    await connectDB();

    const scope = await getLeadScope(user.sub, user.role);
    const project = await Project.findOne(
      { _id: params.id, ...projectsVisibleFilter(scope) },
      '_id',
    ).lean();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { orderedIds } = await readBody(req, Body);
    const valid = orderedIds.filter((x) => mongoose.isValidObjectId(x));

    // Only touch tasks that actually belong to this project — a caller
    // can't smuggle in IDs from another project.
    await Task.bulkWrite(
      valid.map((taskId, index) => ({
        updateOne: {
          filter: { _id: taskId, projectId: params.id },
          update: { $set: { position: index } },
        },
      })),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
