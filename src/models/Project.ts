import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';
import { LIFECYCLES } from '@/lib/lifecycles';

// Single source of truth for the lifecycle enum — mirrors the template
// catalogue so a template added in lifecycles.ts is automatically a valid
// project lifecycle (no more "X is not a valid enum value" on create).
const LIFECYCLE_KEYS = Object.keys(LIFECYCLES);

const PhaseSchema = new Schema(
  {
    name: { type: String, required: true },
    position: { type: Number, default: 0 }
  },
  { _id: true }
);

const ProjectSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    lifecycle: {
      type: String,
      enum: LIFECYCLE_KEYS,
      default: 'generic'
    },
    status: {
      type: String,
      enum: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'],
      default: 'planning'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    // Personal projects are a single user's private to-do list (see
    // /api/projects/personal). They must never appear in any cross-user or
    // admin rollup — only their owner can see them. Identified by this flag
    // (and, for legacy rows created before the flag, the "PRSN-" code prefix).
    isPersonal: { type: Boolean, default: false },
    startDate: { type: Date },
    dueDate: { type: Date },
    completedAt: { type: Date },
    gxpImpact: { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'none' },
    regulatoryRefs: { type: String, default: '' },
    phases: { type: [PhaseSchema], default: [] },

    // ── Archive state ───────────────────────────────────────────────────
    // Archiving keeps the record (and its tasks) so historical reports
    // and audit trails remain intact — only the default project list
    // and dashboard hide it. Toggleable from the project header by
    // lead/admin. archivedAt also stamps the moment for the audit log.
    archived:   { type: Boolean, default: false },
    archivedAt: { type: Date,    default: null   },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Personal projects ───────────────────────────────────────────────
    // A personal project is private to its owner — never surfaced to other
    // users (including admins) anywhere in the app. Any authenticated user
    // can create one; it carries no team.
    personal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ProjectSchema.index({ teamId: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ archived: 1 });
// Hot read paths: project list/detail filters combine team/owner visibility,
// archived state, status tabs, and newest-first ordering. These compound
// indexes keep /projects and /projects/[id] off broad scans as workspaces grow.
ProjectSchema.index({ teamId: 1, archived: 1, status: 1, createdAt: -1 });
ProjectSchema.index({ ownerId: 1, archived: 1, status: 1, createdAt: -1 });
ProjectSchema.index({ lifecycle: 1, archived: 1 });

export type ProjectDoc = InferSchemaType<typeof ProjectSchema> & { _id: mongoose.Types.ObjectId };

export const Project: Model<ProjectDoc> =
  (mongoose.models.Project as Model<ProjectDoc>) ||
  mongoose.model<ProjectDoc>('Project', ProjectSchema);
