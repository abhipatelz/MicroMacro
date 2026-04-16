import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Application } from '@/models/Application';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { assessOpenTasks } from '@/lib/ai/riskService';

export const runtime = 'nodejs';

// Returns a per-application "where is this stuck?" view -- mixes hard signals
// (overdue, blocked, GxP-critical open, QA-signoff pending) with the AI risk
// model's predicted miss-probability so the DGM can prioritise where to
// intervene without scrolling through Excel rows.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const app = await Application.findById(params.id).lean();
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const projects = await Project.find({ applicationId: app._id }).lean();
    const projectIds = projects.map((p) => p._id);
    if (projectIds.length === 0) {
      return NextResponse.json({
        application: { id: String(app._id), name: (app as any).name, key: (app as any).key },
        members: [],
        topRiskTasks: [],
        projectHotspots: [],
        signals: { overdue: 0, blocked: 0, gxpCriticalOpen: 0, qaSignoffPending: 0 }
      });
    }
    const now = new Date();

    const [overdue, blocked, gxpCriticalOpen, qaSignoffPending] = await Promise.all([
      Task.countDocuments({
        projectId: { $in: projectIds },
        status: { $ne: 'done' },
        dueDate: { $ne: null, $lt: now }
      }),
      Task.countDocuments({ projectId: { $in: projectIds }, status: 'blocked' }),
      Task.countDocuments({
        projectId: { $in: projectIds },
        status: { $ne: 'done' },
        gxpCritical: true
      }),
      Task.countDocuments({
        projectId: { $in: projectIds },
        requiresQaSignoff: true,
        qaSignoffAt: null,
        status: 'done'
      })
    ]);

    // run the risk model just for tasks under this application's projects
    const allRisk = await assessOpenTasks();
    const projectIdSet = new Set(projectIds.map((p) => String(p)));
    const appRisk = allRisk.tasks.filter((t) => projectIdSet.has(t.projectId));

    // per-member aggregate
    const memberIds = ((app as any).memberIds || []) as any[];
    const ownerId = (app as any).ownerId;
    const allUserIds = [...new Set([...(memberIds.map((m: any) => String(m))), ownerId ? String(ownerId) : null].filter(Boolean))] as string[];
    const users = await User.find({ _id: { $in: allUserIds } }).lean();
    const memberMetrics = await Promise.all(
      users.map(async (user) => {
        const uid = user._id;
        const [assigned, done, ovd, bk, gxp] = await Promise.all([
          Task.countDocuments({ projectId: { $in: projectIds }, assigneeId: uid }),
          Task.countDocuments({
            projectId: { $in: projectIds },
            assigneeId: uid,
            status: 'done'
          }),
          Task.countDocuments({
            projectId: { $in: projectIds },
            assigneeId: uid,
            status: { $ne: 'done' },
            dueDate: { $ne: null, $lt: now }
          }),
          Task.countDocuments({
            projectId: { $in: projectIds },
            assigneeId: uid,
            status: 'blocked'
          }),
          Task.countDocuments({
            projectId: { $in: projectIds },
            assigneeId: uid,
            status: { $ne: 'done' },
            gxpCritical: true
          })
        ]);
        const userRisk = appRisk.filter((r) => r.assigneeId === String(uid));
        const highRiskCount = userRisk.filter((r) => r.label === 'high').length;
        const avgRisk = userRisk.length
          ? userRisk.reduce((a, r) => a + r.probability, 0) / userRisk.length
          : 0;
        // simple weighted "bottleneck score" -- transparent so DGM can argue with it
        const bottleneckScore =
          ovd * 4 + bk * 3 + highRiskCount * 2 + gxp * 1.5 + (assigned - done) * 0.2;
        return {
          id: String(uid),
          name: user.name,
          title: user.title,
          assigned,
          done,
          openLoad: assigned - done,
          overdue: ovd,
          blocked: bk,
          gxpCriticalOpen: gxp,
          highRiskCount,
          avgRiskProbability: Math.round(avgRisk * 100) / 100,
          bottleneckScore: Math.round(bottleneckScore * 10) / 10
        };
      })
    );
    memberMetrics.sort((a, b) => b.bottleneckScore - a.bottleneckScore);

    // per-project hotspots
    const projectHotspots = await Promise.all(
      projects.map(async (p) => {
        const [taskCount, doneCount, ovd] = await Promise.all([
          Task.countDocuments({ projectId: p._id }),
          Task.countDocuments({ projectId: p._id, status: 'done' }),
          Task.countDocuments({
            projectId: p._id,
            status: { $ne: 'done' },
            dueDate: { $ne: null, $lt: now }
          })
        ]);
        const risks = appRisk.filter((r) => r.projectId === String(p._id));
        const highRisk = risks.filter((r) => r.label === 'high').length;
        return {
          id: String(p._id),
          code: p.code,
          name: p.name,
          status: p.status,
          lifecycle: p.lifecycle,
          dueDate: p.dueDate,
          taskCount,
          doneCount,
          overdue: ovd,
          highRisk
        };
      })
    );
    projectHotspots.sort(
      (a, b) => b.overdue + b.highRisk * 0.7 - (a.overdue + a.highRisk * 0.7)
    );

    return NextResponse.json({
      application: { id: String(app._id), key: (app as any).key, name: (app as any).name },
      signals: { overdue, blocked, gxpCriticalOpen, qaSignoffPending },
      members: memberMetrics,
      topRiskTasks: appRisk.slice(0, 10),
      projectHotspots
    });
  } catch (e) {
    return handleError(e);
  }
}
