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
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application' },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    startDate: { type: Date },
    dueDate: { type: Date },
    completedAt: { type: Date },
    gxpImpact: { type: String, enum: ['none', 'low', 'medium', 'high'], default: 'none' },
    regulatoryRefs: { type: String, default: '' },
    phases: { type: [PhaseSchema], default: [] }
  },
  { timestamps: true }
);

ProjectSchema.index({ teamId: 1 });
ProjectSchema.index({ applicationId: 1 });
ProjectSchema.index({ status: 1 });

export type ProjectDoc = InferSchemaType<typeof ProjectSchema> & { _id: mongoose.Types.ObjectId };

export const Project: Model<ProjectDoc> =
  (mongoose.models.Project as Model<ProjectDoc>) ||
  mongoose.model<ProjectDoc>('Project', ProjectSchema);
