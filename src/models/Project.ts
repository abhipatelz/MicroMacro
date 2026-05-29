import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

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
      enum: [
        'csv',
        'sop',
        'deviation_capa',
        'change_control',
        'audit',
        'validation',
        'data_integrity',
        'pharmacovigilance',
        'generic'
      ],
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
  },
  { timestamps: true }
);

ProjectSchema.index({ teamId: 1 });
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ archived: 1 });

export type ProjectDoc = InferSchemaType<typeof ProjectSchema> & { _id: mongoose.Types.ObjectId };

export const Project: Model<ProjectDoc> =
  (mongoose.models.Project as Model<ProjectDoc>) ||
  mongoose.model<ProjectDoc>('Project', ProjectSchema);
