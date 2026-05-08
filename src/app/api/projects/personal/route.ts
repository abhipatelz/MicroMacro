import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// GET /api/projects/personal
// Returns the current user's personal project, creating one lazily on first call.
// Lets the QuickAdd modal show "Personal" as a target without forcing PMs to
// pre-create a placeholder project for individual to-dos.
export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const userId = user.sub;
    const code = `PRSN-${String(userId).slice(-6).toUpperCase()}`;

    let proj = await Project.findOne({ code }).lean();

    if (!proj) {
      const u = await User.findById(userId).select('name').lean();
      const firstName = (u?.name ?? 'You').split(' ')[0];
      const created = await Project.create({
        code,
        name: `Personal · ${firstName}`,
        description: 'Your personal to-do list. Tasks here are private to you.',
        lifecycle: 'generic',
        status: 'in_progress',
        priority: 'medium',
        ownerId: userId,
      });
      proj = created.toObject();
    }

    return NextResponse.json({
      id: String(proj!._id),
      code: proj!.code,
      name: proj!.name,
      lifecycle: proj!.lifecycle,
      isPersonal: true,
    });
  } catch (e) {
    return handleError(e);
  }
}
