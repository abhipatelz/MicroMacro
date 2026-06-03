// ALCOA+ data-integrity scorer — deterministic, no external deps, unit-testable.
// Operates on a plain TaskSnapshot so it works in server code, client components,
// and test files without pulling in Mongoose or Next.js.

export type AlcoaPrinciple =
  | 'attributable'
  | 'legible'
  | 'contemporaneous'
  | 'original'
  | 'accurate'
  | 'complete'
  | 'consistent'
  | 'enduring'
  | 'available'

export interface SignalResult {
  label: string
  pass: boolean   // true = scored, false = gap
  points: number  // points awarded (0 if not pass)
  na?: boolean    // true = not applicable, full credit given
}

export interface PrincipleScore {
  score: number
  max: number
  label: string
  description: string
  signals: SignalResult[]
}

export interface AlcoaScore {
  total: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  principles: Record<AlcoaPrinciple, PrincipleScore>
}

// Minimal snapshot — only the fields the scorer needs.
// All optional except title; caller fills what it has.
export interface TaskSnapshot {
  title?: string
  description?: string | null
  status?: string | null
  taskType?: string | null
  priority?: string | null
  assigneeId?: string | null
  requiresQaSignoff?: boolean
  qaSignoffUserId?: string | null
  qaSignoffAt?: Date | string | null
  gxpCritical?: boolean
  ccNo?: string | null
  documentNo?: string | null
  applicableSite?: string | null
  deployStage?: string | null
  createdAt?: Date | string | null
  startDate?: Date | string | null
  dueDate?: Date | string | null
  completedAt?: Date | string | null
  remarks?: string | null
  pendingWith?: string | null
  projectIsPersonal?: boolean
  aiTriage?: {
    severity?: string | null
    severityScore?: number | null
    computedAt?: Date | string | null
  } | null
}

// ─── helpers ────────────────────────────────────────────────────────────────

function toMs(d: Date | string | null | undefined): number | null {
  if (!d) return null
  const t = new Date(d).getTime()
  return isNaN(t) ? null : t
}

function strLen(s: string | null | undefined): number {
  return (s ?? '').trim().length
}

// ─── principle scorers ───────────────────────────────────────────────────────

function scoreAttributable(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  // Ownership — who is responsible for this task
  const owned = !!t.assigneeId
  signals.push({ label: 'Assigned to an owner', pass: owned, points: owned ? 8 : 0 })

  // Signature attribution — if sign-off is required, both who and when must be present
  if (t.requiresQaSignoff) {
    const hasWho = !!t.qaSignoffUserId
    const hasWhen = !!t.qaSignoffAt
    const full = hasWho && hasWhen
    signals.push({
      label: 'QA sign-off attributed (who + when)',
      pass: full,
      points: full ? 7 : hasWho || hasWhen ? 3 : 0,
    })
  } else {
    signals.push({ label: 'QA sign-off not required', pass: true, points: 7, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 15,
    label: 'Attributable',
    description: 'Every action is traceable to the individual who performed it.',
    signals,
  }
}

function scoreLegible(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  // Title quality
  const tLen = strLen(t.title)
  const titlePts = tLen >= 10 ? 5 : tLen >= 3 ? 2 : 0
  signals.push({ label: 'Descriptive title (≥ 10 chars)', pass: tLen >= 10, points: titlePts })

  // Description depth
  const dLen = strLen(t.description)
  const descPts = dLen >= 20 ? 5 : dLen >= 1 ? 2 : 0
  signals.push({ label: 'Description present (≥ 20 chars)', pass: dLen >= 20, points: descPts })

  // Document/SOP reference (required for GxP-critical work)
  if (t.gxpCritical) {
    const hasDoc = strLen(t.documentNo) > 0
    signals.push({ label: 'Document / SOP reference', pass: hasDoc, points: hasDoc ? 5 : 0 })
  } else {
    signals.push({ label: 'Document / SOP reference (N/A)', pass: true, points: 5, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 15,
    label: 'Legible',
    description: 'Records are clear, permanent, and permanently readable.',
    signals,
  }
}

function scoreContemporaneous(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  // Completion timestamp
  if (t.status === 'done') {
    const has = !!t.completedAt
    signals.push({ label: 'Completion time recorded', pass: has, points: has ? 5 : 0 })
  } else {
    signals.push({ label: 'Completion time (task not done yet)', pass: true, points: 5, na: true })
  }

  // Sign-off timestamp
  if (t.requiresQaSignoff && t.qaSignoffUserId) {
    // Signoff happened — was the time captured?
    const has = !!t.qaSignoffAt
    signals.push({ label: 'Sign-off timestamp recorded', pass: has, points: has ? 5 : 0 })
  } else {
    signals.push({ label: 'Sign-off timestamp (N/A)', pass: true, points: 5, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 10,
    label: 'Contemporaneous',
    description: 'Records created at the time of the event, not after the fact.',
    signals,
  }
}

function scoreOriginal(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  // Triage classification run — evidence the record was processed through the engine at creation time
  const triaged = !!t.aiTriage?.computedAt
  if (t.gxpCritical) {
    signals.push({ label: 'Triage engine classification recorded', pass: triaged, points: triaged ? 5 : 0 })
  } else {
    signals.push({ label: 'Triage engine classification (N/A)', pass: true, points: 5, na: true })
  }

  // No backdating signal: start date should not precede record creation
  const createdMs = toMs(t.createdAt)
  const startMs = toMs(t.startDate)
  if (createdMs !== null && startMs !== null) {
    // Allow up to 1 day tolerance for timezone/workflow differences
    const ok = startMs >= createdMs - 86_400_000
    signals.push({ label: 'Start date not before record creation', pass: ok, points: ok ? 5 : 0 })
  } else {
    signals.push({ label: 'Start date / creation date check (N/A)', pass: true, points: 5, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 10,
    label: 'Original',
    description: 'Records are the first capture of information, not retroactive reconstructions.',
    signals,
  }
}

function scoreAccurate(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  // Triage classification present (content evaluated by rule engine)
  const triaged = !!(t.aiTriage?.severity && t.aiTriage?.computedAt)
  signals.push({ label: 'AI triage classification computed', pass: triaged, points: triaged ? 5 : 0 })

  // GxP-critical tasks should not be classified as "minor"
  if (t.gxpCritical) {
    const sev = t.aiTriage?.severity
    const notMinor = sev === 'major' || sev === 'critical'
    signals.push({
      label: 'Severity consistent with GxP-critical flag',
      pass: notMinor,
      points: notMinor ? 5 : sev ? 0 : 3, // no triage yet → partial
    })
  } else {
    signals.push({ label: 'Severity / GxP consistency (N/A)', pass: true, points: 5, na: true })
  }

  // Status and completion consistency
  const doneMismatch = t.status === 'done' && !t.completedAt
  signals.push({
    label: 'Status reflects actual state (done → completedAt set)',
    pass: !doneMismatch,
    points: !doneMismatch ? 5 : 0,
  })

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 15,
    label: 'Accurate',
    description: 'Data reflects what actually happened, free from error or bias.',
    signals,
  }
}

function scoreComplete(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  const hasDesc = strLen(t.description) > 0
  signals.push({ label: 'Description filled', pass: hasDesc, points: hasDesc ? 3 : 0 })

  const hasType = !!t.taskType && t.taskType !== ''
  signals.push({ label: 'Task type classified', pass: hasType, points: hasType ? 3 : 0 })

  const hasPriority = !!t.priority && t.priority !== ''
  signals.push({ label: 'Priority set', pass: hasPriority, points: hasPriority ? 3 : 0 })

  const hasDue = !!t.dueDate
  signals.push({ label: 'Due date defined', pass: hasDue, points: hasDue ? 3 : 0 })

  // GxP tracking completeness
  if (t.gxpCritical) {
    const hasGxpField =
      strLen(t.ccNo) > 0 ||
      (t.applicableSite && t.applicableSite !== 'na') ||
      (t.deployStage && t.deployStage !== 'na')
    signals.push({
      label: 'GxP tracking field present (CC No., site, or stage)',
      pass: !!hasGxpField,
      points: hasGxpField ? 3 : 0,
    })
  } else {
    signals.push({ label: 'GxP tracking fields (N/A)', pass: true, points: 3, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 15,
    label: 'Complete',
    description: 'All required data is present, including repeat attempts and failures.',
    signals,
  }
}

function scoreConsistent(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  const startMs = toMs(t.startDate)
  const dueMs = toMs(t.dueDate)
  if (startMs !== null && dueMs !== null) {
    const ok = dueMs >= startMs
    signals.push({ label: 'Due date is after start date', pass: ok, points: ok ? 3 : 0 })
  } else {
    signals.push({ label: 'Date ordering (N/A)', pass: true, points: 3, na: true })
  }

  const createdMs = toMs(t.createdAt)
  const completedMs = toMs(t.completedAt)
  if (t.status === 'done' && createdMs !== null && completedMs !== null) {
    const ok = completedMs >= createdMs
    signals.push({ label: 'Completion after creation', pass: ok, points: ok ? 2 : 0 })
  } else {
    signals.push({ label: 'Completion / creation ordering (N/A)', pass: true, points: 2, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 5,
    label: 'Consistent',
    description: 'Dates, sequences, and data are internally coherent.',
    signals,
  }
}

function scoreEnduring(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  const isPersonal = !!t.projectIsPersonal
  signals.push({
    label: 'Record within GxP project scope',
    pass: !isPersonal,
    points: !isPersonal ? 5 : 0,
  })

  // Cancelled tasks should have a documented reason
  if (t.status === 'cancelled') {
    const hasReason = strLen(t.remarks) > 0 || strLen(t.description) > 0
    signals.push({
      label: 'Cancellation reason documented',
      pass: hasReason,
      points: hasReason ? 5 : 0,
    })
  } else {
    signals.push({ label: 'Cancellation reason (N/A)', pass: true, points: 5, na: true })
  }

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 10,
    label: 'Enduring',
    description: 'Records survive their required retention period and are never altered.',
    signals,
  }
}

function scoreAvailable(t: TaskSnapshot): PrincipleScore {
  const signals: SignalResult[] = []

  const blocked = !!t.pendingWith
  signals.push({
    label: 'Not blocked / waiting on external party',
    pass: !blocked,
    points: !blocked ? 3 : 1,
  })

  const cancelled = t.status === 'cancelled'
  signals.push({
    label: 'Record is active (not cancelled)',
    pass: !cancelled,
    points: !cancelled ? 2 : 1,
  })

  const score = signals.reduce((s, x) => s + x.points, 0)
  return {
    score, max: 5,
    label: 'Available',
    description: 'Records are accessible to authorised personnel when needed.',
    signals,
  }
}

// ─── public API ─────────────────────────────────────────────────────────────

export function scoreAlcoa(task: TaskSnapshot): AlcoaScore {
  const principles: Record<AlcoaPrinciple, PrincipleScore> = {
    attributable:     scoreAttributable(task),
    legible:          scoreLegible(task),
    contemporaneous:  scoreContemporaneous(task),
    original:         scoreOriginal(task),
    accurate:         scoreAccurate(task),
    complete:         scoreComplete(task),
    consistent:       scoreConsistent(task),
    enduring:         scoreEnduring(task),
    available:        scoreAvailable(task),
  }

  const total = Math.round(
    Object.values(principles).reduce((s, p) => s + p.score, 0)
  )

  const grade: AlcoaScore['grade'] =
    total >= 90 ? 'A' :
    total >= 75 ? 'B' :
    total >= 60 ? 'C' :
    total >= 40 ? 'D' : 'F'

  return { total, grade, principles }
}
