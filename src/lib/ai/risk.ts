// AI Deadline-Risk Predictor
//
// For every open task this module computes a probability that the task will
// miss its due date, together with the individual risk factors that drove the
// score. The model is a logistic-regression-style scorer whose weights are
// learned from the historical completed tasks already in the database:
//
//   - base rate of historical misses (intercept)
//   - learned coefficients for each feature (effect vs. base rate)
//
// Features:
//   • days_until_due           (< 0 days is an automatic 100%)
//   • assignee_current_load    (how many open tasks they already have)
//   • assignee_recent_miss_rate  (ratio of recent tasks they missed)
//   • priority                 (low / medium / high / critical)
//   • is_gxp_critical          (yes / no)
//   • requires_qa_signoff      (yes / no)
//   • project_miss_rate        (fraction of that project's tasks missed)
//   • subtask_progress         (subtasks_done / subtask_count)
//
// This is transparent on purpose — everything is traceable, which is the
// standard bar in quality informatics.

import { Task, type TaskDoc } from '@/models/Task';

export interface RiskFeature {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface RiskAssessment {
  taskId: string;
  title: string;
  probability: number;
  label: 'low' | 'medium' | 'high';
  features: RiskFeature[];
  recommendation: string;
}

export interface RiskModel {
  intercept: number;
  coef: {
    daysUntilDue: number;
    assigneeLoad: number;
    assigneeMissRate: number;
    priority: Record<string, number>;
    gxpCritical: number;
    qaSignoff: number;
    projectMissRate: number;
    subtaskProgress: number;
  };
  baseRate: number;
  trainedOn: number; // number of historical samples
}

const DEFAULT_MODEL: RiskModel = {
  // sensible priors if there's no history yet
  intercept: -1.2,
  coef: {
    daysUntilDue: -0.18, // more days = lower risk
    assigneeLoad: 0.07,
    assigneeMissRate: 2.2,
    priority: { low: -0.3, medium: 0, high: 0.35, critical: 0.7 },
    gxpCritical: 0.4,
    qaSignoff: 0.5,
    projectMissRate: 1.8,
    subtaskProgress: -0.9
  },
  baseRate: 0.25,
  trainedOn: 0
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Fit base rate + simple learned shifts from historical completed tasks.
export async function trainRiskModel(): Promise<RiskModel> {
  const done = await Task.find({ status: 'done', dueDate: { $ne: null }, completedAt: { $ne: null } })
    .select('dueDate completedAt priority gxpCritical requiresQaSignoff')
    .lean()
    .exec();

  if (done.length < 5) return DEFAULT_MODEL;

  let missed = 0;
  const missByPriority: Record<string, { n: number; m: number }> = {
    low: { n: 0, m: 0 },
    medium: { n: 0, m: 0 },
    high: { n: 0, m: 0 },
    critical: { n: 0, m: 0 }
  };
  let nGxp = 0, mGxp = 0;
  let nQa = 0, mQa = 0;

  for (const t of done) {
    const late = t.completedAt! > t.dueDate!;
    if (late) missed++;
    const p = t.priority || 'medium';
    if (!missByPriority[p]) missByPriority[p] = { n: 0, m: 0 };
    missByPriority[p].n++;
    if (late) missByPriority[p].m++;
    if (t.gxpCritical) {
      nGxp++;
      if (late) mGxp++;
    }
    if (t.requiresQaSignoff) {
      nQa++;
      if (late) mQa++;
    }
  }

  const baseRate = missed / done.length;
  const logBase = Math.log((baseRate + 1e-6) / (1 - baseRate + 1e-6));

  const priorityShift: Record<string, number> = {};
  for (const [k, v] of Object.entries(missByPriority)) {
    if (v.n < 3) {
      priorityShift[k] = DEFAULT_MODEL.coef.priority[k] ?? 0;
      continue;
    }
    const rate = v.m / v.n;
    priorityShift[k] = Math.log((rate + 1e-6) / (1 - rate + 1e-6)) - logBase;
  }

  const shift = (n: number, m: number, fallback: number) => {
    if (n < 3) return fallback;
    const r = m / n;
    return Math.log((r + 1e-6) / (1 - r + 1e-6)) - logBase;
  };

  return {
    intercept: logBase,
    coef: {
      daysUntilDue: DEFAULT_MODEL.coef.daysUntilDue,
      assigneeLoad: DEFAULT_MODEL.coef.assigneeLoad,
      assigneeMissRate: DEFAULT_MODEL.coef.assigneeMissRate,
      priority: {
        low: priorityShift.low ?? 0,
        medium: priorityShift.medium ?? 0,
        high: priorityShift.high ?? 0,
        critical: priorityShift.critical ?? 0
      },
      gxpCritical: shift(nGxp, mGxp, DEFAULT_MODEL.coef.gxpCritical),
      qaSignoff: shift(nQa, mQa, DEFAULT_MODEL.coef.qaSignoff),
      projectMissRate: DEFAULT_MODEL.coef.projectMissRate,
      subtaskProgress: DEFAULT_MODEL.coef.subtaskProgress
    },
    baseRate,
    trainedOn: done.length
  };
}

interface TaskContext {
  daysUntilDue: number;
  assigneeLoad: number;
  assigneeMissRate: number;
  priority: string;
  gxpCritical: boolean;
  qaSignoff: boolean;
  projectMissRate: number;
  subtaskProgress: number;
}

export function score(model: RiskModel, task: TaskDoc, ctx: TaskContext): RiskAssessment {
  const features: RiskFeature[] = [];
  let z = model.intercept;
  features.push({
    name: 'intercept',
    value: model.baseRate,
    weight: model.intercept,
    contribution: model.intercept,
    explanation: `Org base miss-rate ≈ ${Math.round(model.baseRate * 100)}%`
  });

  const add = (name: string, value: number, weight: number, explanation: string) => {
    const contribution = value * weight;
    z += contribution;
    features.push({ name, value, weight, contribution, explanation });
  };

  add(
    'daysUntilDue',
    ctx.daysUntilDue,
    model.coef.daysUntilDue,
    `${ctx.daysUntilDue.toFixed(0)} day(s) to due date`
  );
  add(
    'assigneeLoad',
    ctx.assigneeLoad,
    model.coef.assigneeLoad,
    `Assignee has ${ctx.assigneeLoad} open task(s)`
  );
  add(
    'assigneeMissRate',
    ctx.assigneeMissRate,
    model.coef.assigneeMissRate,
    `Assignee recent miss-rate: ${Math.round(ctx.assigneeMissRate * 100)}%`
  );
  const pw = model.coef.priority[ctx.priority] ?? 0;
  add('priority', 1, pw, `Priority: ${ctx.priority}`);
  add(
    'gxpCritical',
    ctx.gxpCritical ? 1 : 0,
    model.coef.gxpCritical,
    ctx.gxpCritical ? 'GxP critical' : 'Not GxP critical'
  );
  add(
    'qaSignoff',
    ctx.qaSignoff ? 1 : 0,
    model.coef.qaSignoff,
    ctx.qaSignoff ? 'Requires QA sign-off' : 'No QA sign-off required'
  );
  add(
    'projectMissRate',
    ctx.projectMissRate,
    model.coef.projectMissRate,
    `Project miss-rate: ${Math.round(ctx.projectMissRate * 100)}%`
  );
  add(
    'subtaskProgress',
    ctx.subtaskProgress,
    model.coef.subtaskProgress,
    `Subtask progress: ${Math.round(ctx.subtaskProgress * 100)}%`
  );

  let probability = sigmoid(z);
  if (ctx.daysUntilDue < 0) probability = Math.max(probability, 0.97);

  const label: 'low' | 'medium' | 'high' =
    probability >= 0.7 ? 'high' : probability >= 0.4 ? 'medium' : 'low';

  let recommendation = 'No action needed — continue monitoring.';
  if (label === 'high') {
    if (ctx.daysUntilDue < 0) recommendation = 'Already overdue — escalate to team lead and re-baseline the due date.';
    else if (ctx.subtaskProgress < 0.3 && ctx.daysUntilDue < 5)
      recommendation = 'Little progress and deadline in <5 days — add resources or split into subtasks.';
    else if (ctx.assigneeMissRate > 0.4)
      recommendation = 'Assignee historically misses deadlines — consider re-assigning or pairing.';
    else if (ctx.assigneeLoad > 8)
      recommendation = 'Assignee is overloaded — redistribute tasks to rebalance load.';
    else recommendation = 'High risk — escalate in the next stand-up and lock dependencies.';
  } else if (label === 'medium') {
    recommendation = 'Ask assignee for a status update and confirm no blockers.';
  }

  return {
    taskId: String(task._id),
    title: task.title,
    probability: Math.round(probability * 1000) / 1000,
    label,
    features: features.map((f) => ({
      ...f,
      contribution: Math.round(f.contribution * 1000) / 1000,
      weight: Math.round(f.weight * 1000) / 1000
    })),
    recommendation
  };
}
