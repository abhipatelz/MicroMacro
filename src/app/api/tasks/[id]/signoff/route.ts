import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'lead', 'admin');
    if (error) return error;
    await connectDB();
    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!t.requiresQaSignoff)
      return NextResponse.json({ error: 'Task does not require QA sign-off' }, { status: 400 });

    // Capture the meaning of the signature (21 CFR Part 11 §11.50). The client
    // may post { reason }; we never require it, but we record whatever is given
    // (defaulting to a clear default meaning) in the immutable audit trail.
    const body = await req.json().catch(() => ({} as any));
    const reason = (typeof body?.reason === 'string' && body.reason.trim()) || 'QA sign-off — reviewed and approved';

    const signedAt = new Date();
    t.qaSignoffUserId = user.sub as any;
    t.qaSignoffAt = signedAt;
    await t.save();

    // §11.10(e): the act of signing a GxP record MUST produce an immutable,
    // attributable audit entry (who / what / when / meaning). Fire-and-forget.
    await logOperation({
      action: 'task.signoff', category: 'task', actor: user,
      targetType: 'task', targetId: params.id, targetLabel: (t as any).title || '',
      summary: `QA signed off "${(t as any).title || 'task'}"`,
      meta: {
        meaning: reason,
        signedBy: user.name || user.sub,
        signedAt: signedAt.toISOString(),
        gxpCritical: !!(t as any).gxpCritical,
        before: { signed: false },
        after:  { signed: true, qaSignoffUserId: String(user.sub) },
      },
    });

    return NextResponse.json(taskS(t));
  } catch (e) {
    return handleError(e);
  }
}
