import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { AuditLog } from '@/models/AuditLog';
import { Project } from '@/models/Project';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// Read the operational audit trail. Admin-only — the trail records management
// actions across the whole workspace, so only the workspace owner sees it.
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
    // Cursor pagination: fetch entries strictly older than this ISO timestamp.
    const before = searchParams.get('before');

    const filter: Record<string, any> = {};
    if (category && category !== 'all') filter.category = category;
    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) filter.createdAt = { $lt: d };
    }

    const [rows, personalProjects] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Project.find({ $or: [{ isPersonal: true }, { code: /^PRSN-/ }] }, '_id').lean(),
    ]);

    // Next-page cursor is derived from the RAW result (before personal-project
    // filtering) so a heavily-filtered page still advances correctly. Null once
    // fewer than `limit` raw rows come back — that's the end of the trail.
    const rawLast = rows.length === limit ? (rows[rows.length - 1] as any).createdAt : null;
    const nextBefore = rawLast
      ? (rawLast instanceof Date ? rawLast.toISOString() : String(rawLast))
      : null;

    // Never surface personal project data in the operational audit trail —
    // personal projects are private to their owners, and should not appear in
    // a cross-user admin view even in log form.
    const personalIds = new Set(personalProjects.map((p: any) => String(p._id)));
    let visible = rows.filter((r: any) => {
      if (r.targetType === 'project' && personalIds.has(r.targetId)) return false;
      if (r.targetType === 'task' && r.meta?.projectId && personalIds.has(String(r.meta.projectId))) return false;
      return true;
    });

    // Batch-check task entries without meta.projectId (e.g. legacy update/delete logs)
    const orphanIds = visible
      .filter((r: any) => r.targetType === 'task' && !r.meta?.projectId && r.targetId)
      .map((r: any) => r.targetId);
    if (orphanIds.length > 0) {
      const { Task } = await import('@/models/Task');
      const taskDocs = await Task.find({ _id: { $in: orphanIds } }, 'projectId').lean();
      const tpMap = new Map(taskDocs.map((t: any) => [String(t._id), String((t as any).projectId)]));
      visible = visible.filter((r: any) => {
        if (r.targetType === 'task' && !r.meta?.projectId) {
          const pid = tpMap.get(String(r.targetId));
          return !pid || !personalIds.has(pid);
        }
        return true;
      });
    }

    return NextResponse.json({
      rows: visible.map((r: any) => ({
        id: String(r._id),
        action: r.action,
        category: r.category,
        actorName: r.actorName || 'System',
        targetType: r.targetType || '',
        targetId: r.targetId || '',
        targetLabel: r.targetLabel || '',
        summary: r.summary || '',
        createdAt: r.createdAt,
      })),
      nextBefore,
    });
  } catch (e) {
    return handleError(e);
  }
}
