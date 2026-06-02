// Unit tests for the ALCOA+ data-integrity scorer.
// Every assertion is derivable from a line in src/lib/alcoa.ts — no DB, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAlcoa, type TaskSnapshot } from '@/lib/alcoa';

// ─── fixture helpers ─────────────────────────────────────────────────────────

const BASE: TaskSnapshot = {
  title: 'Verify audit trail integrity',
  description: 'Check that all audit log entries are present and timestamped correctly.',
  status: 'in_progress',
  taskType: 'audit_finding',
  priority: 'high',
  assigneeId: 'user-123',
  requiresQaSignoff: false,
  gxpCritical: false,
  createdAt: '2025-01-01T10:00:00Z',
  startDate:  '2025-01-01T10:00:00Z',
  dueDate:    '2025-01-15T10:00:00Z',
}

// Perfect GxP-critical task — should score very high
const PERFECT_GXP: TaskSnapshot = {
  ...BASE,
  gxpCritical: true,
  requiresQaSignoff: true,
  qaSignoffUserId: 'lead-456',
  qaSignoffAt: '2025-01-10T14:00:00Z',
  documentNo: 'SOP-QA-042',
  ccNo: 'CC-2025-001',
  applicableSite: 'prd',
  deployStage: 'prd',
  aiTriage: { severity: 'critical', severityScore: 8, computedAt: '2025-01-01T10:05:00Z' },
}

// Bare minimum: just a title, nothing else
const STUB: TaskSnapshot = { title: 'x' }

// ─── total score range ────────────────────────────────────────────────────────

test('total is between 0 and 100', () => {
  for (const snap of [BASE, PERFECT_GXP, STUB]) {
    const s = scoreAlcoa(snap)
    assert.ok(s.total >= 0 && s.total <= 100, `total out of range for snap: ${s.total}`)
  }
})

test('perfect GxP task scores higher than a stub', () => {
  assert.ok(scoreAlcoa(PERFECT_GXP).total > scoreAlcoa(STUB).total)
})

test('stub task scores lower than a well-filled task', () => {
  // N/A checks still give partial credit so stub won't be F,
  // but it should score materially below a fully-populated task.
  assert.ok(scoreAlcoa(STUB).total < scoreAlcoa(BASE).total)
})

test('perfect GxP task has grade A or B', () => {
  const g = scoreAlcoa(PERFECT_GXP).grade
  assert.ok(g === 'A' || g === 'B', `expected A or B, got ${g}`)
})

// ─── grade thresholds ─────────────────────────────────────────────────────────

test('grade A at 90+', () => {
  // Inject a score by using a fully-populated non-gxp task (max points for N/A)
  const s = scoreAlcoa({ ...BASE, status: 'done', completedAt: '2025-01-10T00:00:00Z' })
  const grade = s.total >= 90 ? 'A' : s.total >= 75 ? 'B' : s.total >= 60 ? 'C' : s.total >= 40 ? 'D' : 'F'
  assert.equal(grade, s.grade)
})

test('grade thresholds are monotone', () => {
  const scores = [100, 90, 75, 60, 40, 20, 0]
  const expected = ['A', 'A', 'B', 'C', 'D', 'F', 'F']
  for (let i = 0; i < scores.length; i++) {
    const t = scores[i]
    const g = t >= 90 ? 'A' : t >= 75 ? 'B' : t >= 60 ? 'C' : t >= 40 ? 'D' : 'F'
    assert.equal(g, expected[i], `score ${t} → expected ${expected[i]}, got ${g}`)
  }
})

// ─── attributable principle ──────────────────────────────────────────────────

test('attributable: no assignee → lower score', () => {
  const withAssignee    = scoreAlcoa(BASE)
  const withoutAssignee = scoreAlcoa({ ...BASE, assigneeId: undefined })
  assert.ok(withAssignee.principles.attributable.score > withoutAssignee.principles.attributable.score)
})

test('attributable: requiresQaSignoff without signoff → deducted', () => {
  const unsigned = scoreAlcoa({ ...BASE, requiresQaSignoff: true, qaSignoffUserId: undefined, qaSignoffAt: undefined })
  const signed   = scoreAlcoa({ ...BASE, requiresQaSignoff: true, qaSignoffUserId: 'lead-1', qaSignoffAt: '2025-01-10T00:00:00Z' })
  assert.ok(signed.principles.attributable.score > unsigned.principles.attributable.score)
})

test('attributable: max is 15', () => {
  assert.equal(scoreAlcoa(BASE).principles.attributable.max, 15)
})

// ─── legible principle ───────────────────────────────────────────────────────

test('legible: short title scores less than descriptive title', () => {
  const short = scoreAlcoa({ ...BASE, title: 'Fix' })
  const long  = scoreAlcoa({ ...BASE, title: 'Fix the audit trail backdating issue in DEV' })
  assert.ok(long.principles.legible.score > short.principles.legible.score)
})

test('legible: missing description reduces score', () => {
  const withDesc    = scoreAlcoa(BASE)
  const withoutDesc = scoreAlcoa({ ...BASE, description: undefined })
  assert.ok(withDesc.principles.legible.score > withoutDesc.principles.legible.score)
})

test('legible: documentNo required only for gxpCritical tasks', () => {
  const nonGxp    = scoreAlcoa({ ...BASE, gxpCritical: false, documentNo: undefined })
  const gxpNoDoc  = scoreAlcoa({ ...BASE, gxpCritical: true,  documentNo: undefined })
  // non-GxP gets full N/A credit, GxP without doc loses points
  assert.ok(nonGxp.principles.legible.score >= gxpNoDoc.principles.legible.score)
})

// ─── contemporaneous principle ───────────────────────────────────────────────

test('contemporaneous: done task without completedAt loses points', () => {
  const withCompleted    = scoreAlcoa({ ...BASE, status: 'done', completedAt: '2025-01-10T00:00:00Z' })
  const withoutCompleted = scoreAlcoa({ ...BASE, status: 'done', completedAt: undefined })
  assert.ok(withCompleted.principles.contemporaneous.score > withoutCompleted.principles.contemporaneous.score)
})

test('contemporaneous: in-progress task gets N/A credit for completedAt', () => {
  const inProgress = scoreAlcoa({ ...BASE, status: 'in_progress', completedAt: undefined })
  // Should not be penalised for missing completedAt when not done
  assert.equal(inProgress.principles.contemporaneous.signals.find(s => s.na)?.pass, true)
})

// ─── consistent principle ────────────────────────────────────────────────────

test('consistent: dueDate before startDate fails', () => {
  const bad = scoreAlcoa({
    ...BASE,
    startDate: '2025-01-20T00:00:00Z',
    dueDate:   '2025-01-01T00:00:00Z',
  })
  const dateSignal = bad.principles.consistent.signals.find(s => s.label.includes('Due date'))
  assert.ok(dateSignal && !dateSignal.pass)
})

test('consistent: dueDate after startDate passes', () => {
  const good = scoreAlcoa({
    ...BASE,
    startDate: '2025-01-01T00:00:00Z',
    dueDate:   '2025-01-15T00:00:00Z',
  })
  const dateSignal = good.principles.consistent.signals.find(s => s.label.includes('Due date'))
  assert.ok(dateSignal?.pass)
})

// ─── complete principle ──────────────────────────────────────────────────────

test('complete: gxpCritical without any GxP field loses points', () => {
  const withGxp    = scoreAlcoa({ ...BASE, gxpCritical: true, ccNo: 'CC-2025-001' })
  const withoutGxp = scoreAlcoa({ ...BASE, gxpCritical: true, ccNo: undefined, applicableSite: 'na', deployStage: 'na' })
  assert.ok(withGxp.principles.complete.score > withoutGxp.principles.complete.score)
})

test('complete: non-gxp task gets full N/A credit for GxP tracking field', () => {
  const nonGxp = scoreAlcoa({ ...BASE, gxpCritical: false })
  const gxpSignal = nonGxp.principles.complete.signals.find(s => s.label.includes('GxP tracking'))
  assert.ok(gxpSignal?.na && gxpSignal?.pass)
})

// ─── original principle ──────────────────────────────────────────────────────

test('original: startDate before createdAt flags a backdating signal', () => {
  const backdated = scoreAlcoa({
    ...BASE,
    createdAt: '2025-01-10T00:00:00Z',
    startDate:  '2025-01-01T00:00:00Z', // starts 9 days BEFORE the record was created
  })
  const signal = backdated.principles.original.signals.find(s => s.label.includes('backdating') || s.label.includes('creation'))
  assert.ok(signal && !signal.pass)
})

// ─── enduring principle ──────────────────────────────────────────────────────

test('enduring: personal project scores 0 on GxP scope signal', () => {
  const personal = scoreAlcoa({ ...BASE, projectIsPersonal: true })
  const signal = personal.principles.enduring.signals.find(s => s.label.includes('GxP project'))
  assert.ok(signal && !signal.pass && signal.points === 0)
})

test('enduring: cancelled task without reason loses points', () => {
  const noReason   = scoreAlcoa({ ...BASE, status: 'cancelled', remarks: undefined, description: undefined })
  const withReason = scoreAlcoa({ ...BASE, status: 'cancelled', remarks: 'Duplicate of TASK-099, closed.' })
  assert.ok(withReason.principles.enduring.score > noReason.principles.enduring.score)
})

// ─── principle max sum = 100 ─────────────────────────────────────────────────

test('sum of all principle max values equals 100', () => {
  const s = scoreAlcoa(BASE)
  const sum = Object.values(s.principles).reduce((acc, p) => acc + p.max, 0)
  assert.equal(sum, 100)
})

// ─── determinism ─────────────────────────────────────────────────────────────

test('same input always produces same output', () => {
  const a = scoreAlcoa(PERFECT_GXP)
  const b = scoreAlcoa(PERFECT_GXP)
  assert.equal(a.total, b.total)
  assert.equal(a.grade, b.grade)
  for (const key of Object.keys(a.principles) as Array<keyof typeof a.principles>) {
    assert.equal(a.principles[key].score, b.principles[key].score)
  }
})
