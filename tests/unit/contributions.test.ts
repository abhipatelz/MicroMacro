// Unit tests for the contribution scoring weight table. scoreTask is pure and
// every point must be traceable to a completed-work attribute (ALCOA+
// Attributable & Accurate) — see src/lib/contributions.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTask } from '@/lib/contributions';

test('a plain completed task is worth the base 5 points', () => {
  assert.equal(scoreTask({}), 5);
  assert.equal(scoreTask({ priority: 'medium' }), 5);
});

test('finishing on or before the due date adds the on-time bonus', () => {
  const due = new Date('2026-01-10T00:00:00Z');
  assert.equal(scoreTask({ completedAt: new Date('2026-01-09T00:00:00Z'), dueDate: due }), 7);
  assert.equal(scoreTask({ completedAt: new Date('2026-01-10T00:00:00Z'), dueDate: due }), 7); // on the day
  assert.equal(scoreTask({ completedAt: new Date('2026-01-11T00:00:00Z'), dueDate: due }), 5); // late
});

test('the CC target date takes precedence over the plain due date for on-time', () => {
  // ccTcd is earlier than dueDate; completing after ccTcd but before dueDate is late.
  const pts = scoreTask({
    completedAt: new Date('2026-01-10T00:00:00Z'),
    ccTcd: new Date('2026-01-05T00:00:00Z'),
    dueDate: new Date('2026-01-31T00:00:00Z'),
  });
  assert.equal(pts, 5);
});

test('GxP-critical and priority each add their documented weight', () => {
  assert.equal(scoreTask({ gxpCritical: true }), 7);          // +2
  assert.equal(scoreTask({ priority: 'high' }), 7);            // +2
  assert.equal(scoreTask({ priority: 'critical' }), 8);       // +3
});

test('review / approval / data_review gates add the lead-ownership bonus', () => {
  assert.equal(scoreTask({ taskType: 'review' }), 7);
  assert.equal(scoreTask({ taskType: 'approval' }), 7);
  assert.equal(scoreTask({ taskType: 'data_review' }), 7);
  assert.equal(scoreTask({ taskType: 'task' }), 5);
});

test('bonuses stack and every point is accounted for', () => {
  const due = new Date('2026-02-01T00:00:00Z');
  // base 5 + onTime 2 + gxp 2 + critical 3 + approval 2 = 14
  const pts = scoreTask({
    completedAt: new Date('2026-01-31T00:00:00Z'),
    dueDate: due,
    gxpCritical: true,
    priority: 'critical',
    taskType: 'approval',
  });
  assert.equal(pts, 14);
});
