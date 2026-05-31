import { redirect } from 'next/navigation';
import { getCurrentUserFromCookie, isAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AuditLog } from '@/models/AuditLog';
import { Project } from '@/models/Project';
import AuditClient from './AuditClient';

export default async function AuditPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (!isAdmin(jwt.role)) redirect('/');

  await connectDB();

  const limit = 150;
  const [rows, personalProjects] = await Promise.all([
    AuditLog.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
    Project.find({ $or: [{ isPersonal: true }, { code: /^PRSN-/ }] }, '_id').lean(),
  ]);

  // Never surface personal project data in the operational audit trail.
  const personalIds = new Set(personalProjects.map((p: any) => String(p._id)));
  let visible = (rows as any[]).filter((r) => {
    if (r.targetType === 'project' && personalIds.has(r.targetId)) return false;
    if (r.targetType === 'task' && r.meta?.projectId && personalIds.has(String(r.meta.projectId))) return false;
    return true;
  });

  // Batch-check task entries without meta.projectId (legacy update/delete logs)
  const orphanIds = visible
    .filter((r) => r.targetType === 'task' && !r.meta?.projectId && r.targetId)
    .map((r) => r.targetId);
  if (orphanIds.length > 0) {
    const { Task } = await import('@/models/Task');
    const taskDocs = await Task.find({ _id: { $in: orphanIds } }, 'projectId').lean();
    const tpMap = new Map(taskDocs.map((t: any) => [String(t._id), String((t as any).projectId)]));
    visible = visible.filter((r) => {
      if (r.targetType === 'task' && !r.meta?.projectId) {
        const pid = tpMap.get(String(r.targetId));
        return !pid || !personalIds.has(pid);
      }
      return true;
    });
  }

  const initialRows = visible.map((r) => ({
    id: String(r._id),
    action: r.action,
    category: r.category,
    actorName: r.actorName,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: r.targetLabel,
    summary: r.summary,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  return <AuditClient initialRows={initialRows} />;
}
