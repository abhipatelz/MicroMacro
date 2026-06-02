// Unit tests for the lifecycle template library and — critically — the
// invariant that the Zod ProjectLifecycleEnum stays in sync with the
// LIFECYCLES map. The two files carry a "keep these synced" comment but
// nothing enforced it until now: if they drift, a user picking a valid
// template would be rejected at the API boundary (or vice versa).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFECYCLES, listLifecycles } from '@/lib/lifecycles';
import { ProjectLifecycleEnum } from '@/lib/validations';

const TASK_TYPES = new Set([
  'task', 'review', 'approval', 'test', 'deviation', 'capa', 'audit_finding', 'data_review',
]);

test('ProjectLifecycleEnum exactly matches the LIFECYCLES keys', () => {
  const enumKeys = [...ProjectLifecycleEnum.options].sort();
  const mapKeys = Object.keys(LIFECYCLES).sort();
  assert.deepEqual(mapKeys, enumKeys);
});

test('every lifecycle has at least one phase and every phase at least one task', () => {
  for (const [key, lc] of Object.entries(LIFECYCLES)) {
    assert.ok(lc.phases.length >= 1, `${key} has no phases`);
    assert.ok(lc.label && lc.description, `${key} missing label/description`);
    for (const phase of lc.phases) {
      assert.ok(phase.name, `${key} has an unnamed phase`);
      assert.ok(phase.tasks.length >= 1, `${key} / ${phase.name} has no tasks`);
      for (const t of phase.tasks) {
        assert.ok(t.title, `${key} / ${phase.name} has a task with no title`);
        assert.ok(TASK_TYPES.has(t.type), `${key} / ${phase.name}: invalid task type "${t.type}"`);
      }
    }
  }
});

test('Life Sciences (GxP) templates flag qa/gxp tasks; Personal templates do not', () => {
  const gxpKeys = Object.entries(LIFECYCLES).filter(([, v]) => v.group === 'Life Sciences');
  assert.ok(gxpKeys.length > 0);
  for (const [key, lc] of gxpKeys) {
    const anyGxp = lc.phases.some((p) => p.tasks.some((t) => t.gxp || t.qa));
    assert.ok(anyGxp, `${key} is Life Sciences but flags no qa/gxp tasks`);
  }
  for (const [, lc] of Object.entries(LIFECYCLES).filter(([, v]) => v.group === 'Personal')) {
    const anyGxp = lc.phases.some((p) => p.tasks.some((t) => t.gxp || t.qa));
    assert.ok(!anyGxp, 'Personal templates must not carry GxP/QA flags');
  }
});

test('listLifecycles reports accurate phase and task counts', () => {
  const list = listLifecycles();
  assert.equal(list.length, Object.keys(LIFECYCLES).length);
  for (const item of list) {
    const lc = LIFECYCLES[item.key];
    assert.equal(item.phaseCount, lc.phases.length);
    assert.equal(item.taskCount, lc.phases.reduce((a, p) => a + p.tasks.length, 0));
  }
});
