// ─── API request validations — single source of truth ─────────────────────────
// Every API route that creates or updates a Project or Task MUST validate its
// incoming body through one of the schemas exported from this file. These
// schemas are also the contract for Informatics-specific fields required by
// 21 CFR Part 11 / GxP audit trails — see CLAUDE.md.
//
// Naming convention:
//   *Create  — POST  bodies (required fields enforced)
//   *Update  — PATCH bodies (everything optional, nullable where the route
//             needs to clear a value)

import { z } from 'zod';

/* ── Shared enums ────────────────────────────────────────────────────────── */

export const PriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const ProjectStatusEnum = z.enum([
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
]);

export const ProjectLifecycleEnum = z.enum([
  'csv',
  'sop',
  'deviation',
  'capa',
  'deviation_capa',
  'change_control',
  'software_change',
  'audit',
  'validation',
  'data_integrity',
  'pharmacovigilance',
  'generic',
  'agile_sprint',
  'software_release',
  'product_launch',
  'research',
]);

export const GxpImpactEnum = z.enum(['none', 'low', 'medium', 'high']);

export const TaskStatusEnum = z.enum([
  'todo',
  'in_progress',
  'review',
  'blocked',
  'done',
]);

export const TaskTypeEnum = z.enum([
  'task',
  'review',
  'approval',
  'test',
  'deviation',
  'capa',
  'audit_finding',
  'data_review',
]);

// Informatics-specific enums — kept distinct from generic priorities/statuses
// because they are tied to physical deployment environments and regulatory
// site classifications in pharma manufacturing.
export const ApplicableSiteEnum = z.enum(['val', 'prd', 'val_prd', 'na']);
export const DeployStageEnum = z.enum(['dev', 'int', 'prd', 'na']);

/* ── Helpers ─────────────────────────────────────────────────────────────── */

// ISO-date or empty/null. We accept strings here and let the API route turn
// them into Date objects right before they hit Mongoose, so the schema stays
// JSON-friendly.
const dateString = z
  .string()
  .refine((s) => s === '' || !Number.isNaN(Date.parse(s)), {
    message: 'Invalid date string (expected ISO-8601)',
  });

const optionalObjectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId')
  .optional();

const nullableObjectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId')
  .nullable()
  .optional();

/* ── Username ──────────────────────────────────────────────────────────────
   Short Instagram-style handle. Lower-cased, 3-30 chars, ASCII letters /
   digits / underscore / dot. The `.` lets people use "first.last" but the
   first char must be a letter so we can't end up with leading-dot dotfiles
   in any log line, and a trailing dot is rejected for the same reason. */
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3,  'Username must be at least 3 characters.')
  .max(30, 'Username must be 30 characters or fewer.')
  .regex(/^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/, 'Use letters, digits, underscores or dots. Must start with a letter.');

/* ── Project schemas ─────────────────────────────────────────────────────── */

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  code: z.string().max(40).optional(),
  description: z.string().max(5000).optional(),
  lifecycle: ProjectLifecycleEnum.default('generic'),
  priority: PriorityEnum.optional(),
  teamId: optionalObjectId,
  ownerId: optionalObjectId,
  // Personal project — private to the creator, carries no team.
  personal: z.boolean().optional(),
  startDate: dateString.optional(),
  dueDate: dateString.optional(),
  // GxP impact is a regulatory classification — explicitly enumerated, never
  // free text. Drives downstream validation effort and approval routing.
  gxpImpact: GxpImpactEnum.optional(),
  // A personal project is a private, owner-only workspace (not a GxP record).
  // It is excluded from every cross-user rollup, team view and audit log, so it
  // carries no compliance weight — explicitly flagged here, never inferred.
  isPersonal: z.boolean().optional(),
  useTemplate: z.boolean().default(true),
  customPhases: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        tasks: z.array(z.string().max(300)),
      }),
    )
    .optional(),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: ProjectStatusEnum.optional(),
  priority: PriorityEnum.optional(),
  teamId: nullableObjectId,
  ownerId: nullableObjectId,
  startDate: dateString.nullable().optional(),
  dueDate: dateString.nullable().optional(),
  gxpImpact: GxpImpactEnum.optional(),
});
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;

// Requires PM password re-entry for destructive project deletion (21 CFR 11 audit intent).
export const DeleteProjectSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
export type DeleteProjectInput = z.infer<typeof DeleteProjectSchema>;

/* ── Team schemas ────────────────────────────────────────────────────────── */

// Teams are scoped to one of three operating functions: keeping the lights
// on (RTB), delivering change (CTB), or a catch-all (General). The legacy
// informatics values are still accepted so existing teams keep validating
// on edit — they're just no longer offered when creating a team.
export const TeamFunctionEnum = z.enum([
  'general',
  'ctb',
  'rtb',
  // legacy — accepted for backward compatibility, not offered in the UI
  'data_integrity',
  'csv_validation',
  'pharmacovigilance',
  'lab_informatics',
  'audit',
  'training',
]);

// PM-only update. Each field independently optional so callers can patch
// just the bits they need (rename, swap lead, add/remove members).
export const TeamUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  leadId: nullableObjectId,
  memberIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId'))
    .max(200)
    .optional(),
  function: TeamFunctionEnum.optional(),
});
export type TeamUpdateInput = z.infer<typeof TeamUpdateSchema>;

// Requires PM password re-entry for destructive team deletion (21 CFR 11 audit intent).
export const DeleteTeamSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
export type DeleteTeamInput = z.infer<typeof DeleteTeamSchema>;

/* ── Task schemas ────────────────────────────────────────────────────────── */

export const TaskCreateSchema = z.object({
  projectId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, 'Invalid project ObjectId'),
  phaseId: optionalObjectId,
  title: z.string().min(1, 'Task title is required').max(300),
  description: z.string().max(10_000).optional(),
  assigneeId: optionalObjectId,
  priority: PriorityEnum.optional(),
  taskType: TaskTypeEnum.optional(),

  // GxP / sign-off flags — explicit booleans, never coerced. A task that
  // requires QA sign-off MUST be flagged here so the audit trail and the
  // e-signature ceremony are wired in correctly (21 CFR 11.50, 11.70).
  gxpCritical: z.boolean().optional(),
  requiresQaSignoff: z.boolean().optional(),

  startDate: dateString.optional(),
  dueDate: dateString.optional(),
  estimatedHours: z.number().nonnegative().max(10_000).optional(),

  // ─── Informatics / Change-Control fields ─────────────────────────────
  // These mirror what QA teams already record in Change Control IDP sheets;
  // they must stay explicit on every Task payload so the system can rebuild
  // an audit trail joinable back to source CC documentation.
  ccNo: z.string().max(60).optional(),            // e.g. "CC-2025-042"
  ccTcd: dateString.optional(),                   // CC Target Completion Date
  documentNo: z.string().max(120).optional(),     // SOP / protocol reference
  applicableSite: ApplicableSiteEnum.optional(),  // val / prd / val_prd / na
  deployStage: DeployStageEnum.optional(),        // dev / int / prd / na
  remarks: z.string().max(5000).optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10_000).optional(),
  assigneeId: nullableObjectId,
  status: TaskStatusEnum.optional(),
  priority: PriorityEnum.optional(),
  taskType: TaskTypeEnum.optional(),

  gxpCritical: z.boolean().optional(),
  requiresQaSignoff: z.boolean().optional(),

  startDate: dateString.nullable().optional(),
  dueDate: dateString.nullable().optional(),
  estimatedHours: z.number().nonnegative().max(10_000).nullable().optional(),
  actualHours: z.number().nonnegative().max(10_000).nullable().optional(),
  phaseId: nullableObjectId,

  // Informatics / Change-Control fields — nullable on update so a record can
  // be cleared if a CC is voided, but the field shape itself stays strict.
  ccNo: z.string().max(60).optional(),
  ccTcd: dateString.nullable().optional(),
  documentNo: z.string().max(120).optional(),
  applicableSite: ApplicableSiteEnum.optional(),
  deployStage: DeployStageEnum.optional(),
  remarks: z.string().max(5000).optional(),
  pendingWith: z.string().max(120).optional(),
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
