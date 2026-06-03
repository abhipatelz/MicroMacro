// Unit tests for the central Zod request schemas. These are the API contract
// for GxP/Informatics fields (21 CFR Part 11) — see CLAUDE.md. The tests pin
// down that required fields stay required, enums stay strict (never loosened
// to z.any/passthrough), and informatics fields keep their exact shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProjectCreateSchema,
  TaskCreateSchema,
  TaskUpdateSchema,
  UsernameSchema,
} from '@/lib/validations';

const OID = '507f1f77bcf86cd799439011';

test('ProjectCreateSchema requires a name', () => {
  assert.equal(ProjectCreateSchema.safeParse({}).success, false);
  assert.equal(ProjectCreateSchema.safeParse({ name: '' }).success, false);
});

test('ProjectCreateSchema applies documented defaults', () => {
  const r = ProjectCreateSchema.parse({ name: 'Annual Periodic Review' });
  assert.equal(r.lifecycle, 'generic');
  assert.equal(r.useTemplate, true);
});

test('ProjectCreateSchema rejects an unknown lifecycle (enum not loosened)', () => {
  const r = ProjectCreateSchema.safeParse({ name: 'X', lifecycle: 'not_a_real_lifecycle' });
  assert.equal(r.success, false);
});

test('TaskCreateSchema requires a valid ObjectId projectId and a title', () => {
  assert.equal(TaskCreateSchema.safeParse({ title: 'T' }).success, false); // no projectId
  assert.equal(TaskCreateSchema.safeParse({ projectId: 'nope', title: 'T' }).success, false);
  assert.equal(TaskCreateSchema.safeParse({ projectId: OID }).success, false); // no title
  assert.equal(TaskCreateSchema.safeParse({ projectId: OID, title: 'T' }).success, true);
});

test('TaskCreateSchema keeps Informatics/GxP fields explicit and typed', () => {
  const r = TaskCreateSchema.parse({
    projectId: OID,
    title: 'IQ for LIMS',
    gxpCritical: true,
    requiresQaSignoff: true,
    ccNo: 'CC-2025-042',
    applicableSite: 'val_prd',
    deployStage: 'prd',
  });
  assert.equal(r.gxpCritical, true);
  assert.equal(r.requiresQaSignoff, true);
  assert.equal(r.applicableSite, 'val_prd');
  assert.equal(r.deployStage, 'prd');

  // Enumerated informatics fields must reject out-of-range values, never coerce.
  assert.equal(
    TaskCreateSchema.safeParse({ projectId: OID, title: 'T', applicableSite: 'mars' }).success,
    false,
  );
  assert.equal(
    TaskCreateSchema.safeParse({ projectId: OID, title: 'T', deployStage: 'space' }).success,
    false,
  );
  // gxpCritical must stay a real boolean — a string must not be silently accepted.
  assert.equal(
    TaskCreateSchema.safeParse({ projectId: OID, title: 'T', gxpCritical: 'true' as any }).success,
    false,
  );
});

test('TaskUpdateSchema is all-optional and allows clearing nullable fields', () => {
  assert.equal(TaskUpdateSchema.safeParse({}).success, true);
  assert.equal(TaskUpdateSchema.safeParse({ assigneeId: null, dueDate: null }).success, true);
  assert.equal(TaskUpdateSchema.safeParse({ status: 'done' }).success, true);
  assert.equal(TaskUpdateSchema.safeParse({ status: 'invented_status' }).success, false);
});

test('UsernameSchema enforces the handle rules and normalises case', () => {
  assert.equal(UsernameSchema.parse('First.Last'), 'first.last'); // lowercased
  assert.equal(UsernameSchema.safeParse('ab').success, false);     // too short
  assert.equal(UsernameSchema.safeParse('.leadingdot').success, false);
  assert.equal(UsernameSchema.safeParse('trailingdot.').success, false);
  assert.equal(UsernameSchema.safeParse('9startswithdigit').success, false);
  assert.equal(UsernameSchema.safeParse('valid_user.name').success, true);
});
