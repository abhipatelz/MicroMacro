// helpers to turn Mongoose docs into plain JSON-safe shapes

type Any = Record<string, any>;

function id(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.toString) return v.toString();
  return undefined;
}

export function u(user: any) {
  if (!user) return null;
  return {
    id: id(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    title: user.title
  };
}

export function team(t: any, extras: Any = {}) {
  if (!t) return null;
  return {
    id: id(t._id),
    name: t.name,
    description: t.description,
    leadId: id(t.leadId),
    function: t.function,
    memberIds: (t.memberIds || []).map((m: any) => id(m)),
    ...extras
  };
}

export function project(p: any, extras: Any = {}) {
  if (!p) return null;
  return {
    id: id(p._id),
    code: p.code,
    name: p.name,
    description: p.description,
    lifecycle: p.lifecycle,
    status: p.status,
    priority: p.priority,
    teamId: id(p.teamId),
    ownerId: id(p.ownerId),
    startDate: p.startDate,
    dueDate: p.dueDate,
    completedAt: p.completedAt,
    gxpImpact: p.gxpImpact,
    regulatoryRefs: p.regulatoryRefs,
    phases: (p.phases || []).map((ph: any) => ({
      id: id(ph._id),
      name: ph.name,
      position: ph.position
    })),
    createdAt: p.createdAt,
    ...extras
  };
}

export function subtask(s: any) {
  return {
    id: id(s._id),
    title: s.title,
    assigneeId: id(s.assigneeId),
    status: s.status,
    dueDate: s.dueDate,
    completedAt: s.completedAt,
    position: s.position
  };
}

export function comment(c: any) {
  return {
    id: id(c._id),
    userId: id(c.userId),
    body: c.body,
    createdAt: c.createdAt
  };
}

export function task(t: any, extras: Any = {}) {
  if (!t) return null;
  return {
    id: id(t._id),
    projectId: id(t.projectId),
    phaseId: id(t.phaseId),
    title: t.title,
    description: t.description,
    assigneeId: id(t.assigneeId),
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    gxpCritical: !!t.gxpCritical,
    requiresQaSignoff: !!t.requiresQaSignoff,
    qaSignoffUserId: id(t.qaSignoffUserId),
    qaSignoffAt: t.qaSignoffAt,
    startDate: t.startDate,
    dueDate: t.dueDate,
    completedAt: t.completedAt,
    estimatedHours: t.estimatedHours,
    actualHours: t.actualHours,
    // Pharma fields
    ccNo:           t.ccNo     || '',
    ccTcd:          t.ccTcd    || null,
    documentNo:     t.documentNo || '',
    applicableSite: t.applicableSite || 'na',
    deployStage:    t.deployStage   || 'na',
    remarks:        t.remarks  || '',
    aiTriage: t.aiTriage
      ? {
          severity: t.aiTriage.severity,
          severityScore: t.aiTriage.severityScore,
          category: t.aiTriage.category,
          rationale: t.aiTriage.rationale,
          suggestedCapa: t.aiTriage.suggestedCapa,
          similarTaskIds: (t.aiTriage.similarTaskIds || []).map((x: any) => id(x)),
          computedAt: t.aiTriage.computedAt
        }
      : null,
    subtasks: (t.subtasks || []).map(subtask),
    comments: (t.comments || []).map(comment),
    effortLog: (t.effortLog || []).map((e: any) => ({
      id: id(e._id),
      userId: id(e.userId),
      minutes: e.minutes,
      note: e.note || '',
      onDate: e.onDate || '',
      source: e.source || 'manual',
      createdAt: e.createdAt,
    })),
    effortMins: (t.effortLog || []).reduce((s: number, e: any) => s + (e.minutes || 0), 0),
    lastActivityAt: t.lastActivityAt || t.updatedAt || t.createdAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...extras
  };
}
