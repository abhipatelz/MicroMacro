// Unit tests for the priority-weighted project progress calculation.
// Pure function, no DB — run with `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightedProgress, PRIORITY_WEIGHT } from '@/lib/progress';

test('empty task list is 0% (no divide-by-zero)', () => {
  assert.equal(weightedProgress([]), 0);
});

test('all tasks done is 100%', () => {
  assert.equal(
    weightedProgress([
      { status: 'done', priority: 'low' },
      { status: 'done', priority: 'critical' },
    ]),
    100,
  );
});

test('nothing done is 0%', () => {
  assert.equal(
    weightedProgress([
      { status: 'todo', priority: 'high' },
      { status: 'in_progress', priority: 'low' },
    ]),
    0,
  );
});

test('progress is weighted by priority, not a flat count', () => {
  // One critical (weight 4) done out of critical(4) + low(1) = 4/5 = 80%.
  // A flat done/total ratio would wrongly report 50%.
  assert.equal(
    weightedProgress([
      { status: 'done', priority: 'critical' },
      { status: 'todo', priority: 'low' },
    ]),
    80,
  );
});

test('unknown / missing priority is treated as medium weight', () => {
  // medium weight is 2. One done medium-equivalent out of (2 + 2) = 50%.
  assert.equal(
    weightedProgress([
      { status: 'done' },
      { status: 'todo', priority: 'medium' },
    ]),
    50,
  );
  assert.equal(weightedProgress([{ status: 'done', priority: 'banana' }]), 100);
});

test('result is rounded to a whole percent', () => {
  // two medium done (4), one high not done (3) => 4/7 = 57.14 -> 57
  const p = weightedProgress([
    { status: 'done', priority: 'medium' },
    { status: 'done', priority: 'medium' },
    { status: 'todo', priority: 'high' },
  ]);
  assert.equal(p, 57);
});

test('weight table matches the documented GxP weighting', () => {
  assert.deepEqual(PRIORITY_WEIGHT, { critical: 4, high: 3, medium: 2, low: 1 });
});
