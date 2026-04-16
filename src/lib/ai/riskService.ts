import { connectDB } from '@/lib/db';
import { Task, type TaskDoc } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { score, trainRiskModel, type RiskModel, type RiskAssessment } from './risk';

interface AssigneeStats {
  load: number;
  missRate: number;
}
interface ProjectStats {
  missRate: number;
}

async function buildAssigneeStats(): Promise<Map<string, AssigneeStats>> {
  const userOpen = await Task.aggregate([
    { $match: { status: { $ne: 'done' }, assigneeId: { $ne: null } } },
    { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
  ]);
  const userHist = await Task.aggregate([
    {
      $match: {
        status: 'done',
        assigneeId: { $ne: null },
        dueDate: { $ne: null },
        completedAt: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$assigneeId',
        n: { $sum: 1 },
        missed: {
          $sum: { $cond: [{ $gt: ['$completedAt', '$dueDate'] }, 1, 0] }
        }
      }
    }
  ]);
  const m = new Map<string, AssigneeStats>();
  for (const u of userOpen) m.set(String(u._id), { load: u.count, missRate: 0 });
  for (const h of userHist) {
    const k = String(h._id);
    const existing = m.get(k) || { load: 0, missRate: 0 };
    existing.missRate = h.n > 0 ? h.missed / h.n : 0;
    m.set(k, existing);
  }
  return m;
}

async function buildProjectStats(): Promise<Map<string, ProjectStats>> {
  const stats = await Task.aggregate([
    { $match: { status: 'done', dueDate: { $ne: null }, completedAt: { $ne: null } } },
    {
      $group: {
        _id: '$projectId',
        n: { $sum: 1 },
        missed: {
          $sum: { $cond: [{ $gt: ['$completedAt', '$dueDate'] }, 1, 0] }
        }
      }
    }
  ]);
  const m = new Map<string, ProjectStats>();
  for (const s of stats) {
    m.set(String(s._id), { missRate: s.n > 0 ? s.missed / s.n : 0 });
  }
  return m;
}

export interface RiskScored extends RiskAssessment {
  projectId: string;
  projectCode?: string;
  projectName?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
}

export async function assessOpenTasks(opts: { teamId?: string; userId?: string } = {}) {
  await connectDB();
  const model = await trainRiskModel();
  const [assigneeStats, projectStats] = await Promise.all([
    buildAssigneeStats(),
    buildProjectStats()
  ]);

  const taskQ: any = { status: { $ne: 'done' } };
  if (opts.userId) taskQ.assigneeId = opts.userId;
  let projectIds: any[] | undefined;
  if (opts.teamId) {
    const projs = await Project.find({ teamId: opts.teamId }).select('_id').lean();
    projectIds = projs.map((p) => p._id);
    taskQ.projectId = { $in: projectIds };
  }

  const tasks = await Task.find(taskQ).lean<TaskDoc[]>();

  const projMap = await Project.find(
    projectIds ? { _id: { $in: projectIds } } : {}
  )
    .select('_id code name')
    .lean();
  const projLookup = new Map(projMap.map((p) => [String(p._id), p]));

  const userMap = await User.find({}).select('_id name').lean();
  const userLookup = new Map(userMap.map((u) => [String(u._id), u]));

  const now = Date.now();
  const out: RiskScored[] = [];
  for (const t of tasks) {
    const daysUntilDue = t.dueDate
      ? (new Date(t.dueDate).getTime() - now) / 86400000
      : 14;
    const a = t.assigneeId ? assigneeStats.get(String(t.assigneeId)) : null;
    const p = projectStats.get(String(t.projectId));
    const subs = (t as any).subtasks || [];
    const subtaskProgress = subs.length
      ? subs.filter((s: any) => s.status === 'done').length / subs.length
      : 0;

    const assessment = score(model, t as any, {
      daysUntilDue,
      assigneeLoad: a?.load ?? 0,
      assigneeMissRate: a?.missRate ?? model.baseRate,
      priority: t.priority || 'medium',
      gxpCritical: !!t.gxpCritical,
      qaSignoff: !!t.requiresQaSignoff,
      projectMissRate: p?.missRate ?? model.baseRate,
      subtaskProgress
    });

    const proj = projLookup.get(String(t.projectId));
    const user = t.assigneeId ? userLookup.get(String(t.assigneeId)) : null;

    out.push({
      ...assessment,
      projectId: String(t.projectId),
      projectCode: proj?.code,
      projectName: proj?.name,
      assigneeId: t.assigneeId ? String(t.assigneeId) : undefined,
      assigneeName: user?.name,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined
    });
  }

  out.sort((a, b) => b.probability - a.probability);
  return { model: { baseRate: model.baseRate, trainedOn: model.trainedOn }, tasks: out };
}
