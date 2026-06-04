// Unit tests for the cosmetic-vs-meaningful distinction baked into the
// Flow Signal helpers. The spec is explicit: editing a task's title or
// pushing out its due date must NOT advance lastMeaningfulActivityAt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchHasMeaningfulField, COSMETIC_TASK_FIELDS } from '@/lib/flow/events';

test('a status change is meaningful', () => {
  assert.equal(patchHasMeaningfulField(['status']), true);
});

test('an assignee change is meaningful', () => {
  assert.equal(patchHasMeaningfulField(['assigneeId']), true);
});

test('a title edit is purely cosmetic', () => {
  assert.equal(patchHasMeaningfulField(['title']), false);
});

test('extending the due date is purely cosmetic', () => {
  assert.equal(patchHasMeaningfulField(['dueDate']), false);
  assert.equal(patchHasMeaningfulField(['ccTcd']), false);
});

test('priority / GxP / sign-off flag edits are cosmetic for activity purposes', () => {
  // These can be policy-significant for audit, but they do NOT count as
  // "work moved" — that's the distinction Flow Signal depends on.
  assert.equal(patchHasMeaningfulField(['priority']), false);
  assert.equal(patchHasMeaningfulField(['gxpCritical']), false);
  assert.equal(patchHasMeaningfulField(['requiresQaSignoff']), false);
});

test('a mixed patch with at least one meaningful field counts as meaningful', () => {
  assert.equal(patchHasMeaningfulField(['title', 'status']), true);
});

test('COSMETIC_TASK_FIELDS does not list status / assigneeId / completedAt', () => {
  assert.equal(COSMETIC_TASK_FIELDS.has('status'), false);
  assert.equal(COSMETIC_TASK_FIELDS.has('assigneeId'), false);
  assert.equal(COSMETIC_TASK_FIELDS.has('completedAt'), false);
});

test('COSMETIC_TASK_FIELDS lists the documented cosmetic fields', () => {
  const expected = ['title', 'description', 'dueDate', 'priority', 'ccTcd', 'pendingWith'];
  for (const f of expected) {
    assert.equal(COSMETIC_TASK_FIELDS.has(f), true, `expected "${f}" in COSMETIC_TASK_FIELDS`);
  }
});
