import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const SubtaskSchema = new Schema(
  {
    title: { type: String, required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    dueDate: { type: Date },
    completedAt: { type: Date },
    position: { type: Number, default: 0 }
  },
  { _id: true, timestamps: true }
);

const CommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true }
  },
  { _id: true, timestamps: true }
);

/** Effort log entry — minutes spent on this task. */
const EffortEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    minutes: { type: Number, required: true, min: 1, max: 24 * 60 * 30 },
    note: { type: String, default: '' },
    onDate: { type: String, default: '' },
    source: { type: String, enum: ['manual', 'calendar'], default: 'manual' },
  },
  { _id: true, timestamps: true }
);

const TaskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    phaseId: { type: Schema.Types.ObjectId },
    // Manual ordering within a phase (lower = higher up). Lets a lead
    // reshuffle tasks in the by-phase view. Defaults to 0; ties fall back
    // to createdAt so existing tasks keep a stable order.
    position: { type: Number, default: 0 },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'review', 'blocked', 'done'],
      default: 'todo'
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    taskType: {
      type: String,
      enum: ['task', 'review', 'approval', 'test', 'deviation', 'capa', 'audit_finding', 'data_review'],
      default: 'task'
    },
    gxpCritical: { type: Boolean, default: false },
    requiresQaSignoff: { type: Boolean, default: false },
    qaSignoffUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    qaSignoffAt: { type: Date },

    startDate: { type: Date },
    dueDate: { type: Date },
    completedAt: { type: Date },
    estimatedHours: { type: Number },
    actualHours: { type: Number },

    aiTriage: {
      severity: { type: String, enum: ['minor', 'major', 'critical'] },
      severityScore: { type: Number },
      category: { type: String },
      rationale: [{ type: String }],
      suggestedCapa: [{ type: String }],
      similarTaskIds: [{ type: Schema.Types.ObjectId }],
      computedAt: { type: Date }
    },

    // ── Pharma / Change-Control fields ─────────────────────────────────
    // Mirrors the columns teams already track in Excel IDP sheets.
    ccNo:           { type: String, default: '' },   // Change Control number, e.g. "CC-2025-042"
    ccTcd:          { type: Date },                   // CC Target Completion Date
    documentNo:     { type: String, default: '' },   // SOP / protocol / doc reference
    applicableSite: {
      type: String,
      enum: ['val', 'prd', 'val_prd', 'na'],
      default: 'na',
    },
    deployStage: {
      type: String,
      enum: ['dev', 'int', 'prd', 'na'],
      default: 'na',
    },
    remarks: { type: String, default: '' },

    // Who the task is currently stuck/waiting on — a person, role, or
    // department (e.g. "QA", "Sachin", "IT Helpdesk"). Free text so a lead
    // can name whoever the bottleneck is. Empty = not waiting on anyone.
    pendingWith: { type: String, default: '' },

    subtasks: { type: [SubtaskSchema], default: [] },
    comments: { type: [CommentSchema], default: [] },
    effortLog: { type: [EffortEntrySchema], default: [] },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TaskSchema.index({ assigneeId: 1 });
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ projectId: 1, position: 1, createdAt: 1 });
TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ dueDate: 1 });
// Compound indices that match the lead-dashboard aggregations directly —
// open / overdue / done-this-week facets all key off (status, assigneeId)
// or (status, dueDate). With these, Mongo serves the dashboard from
// covering indices instead of full collection scans.
TaskSchema.index({ status: 1, assigneeId: 1 });
TaskSchema.index({ status: 1, dueDate: 1 });
TaskSchema.index({ status: 1, completedAt: -1 });

export type TaskDoc = InferSchemaType<typeof TaskSchema> & { _id: mongoose.Types.ObjectId };

export const Task: Model<TaskDoc> =
  (mongoose.models.Task as Model<TaskDoc>) || mongoose.model<TaskDoc>('Task', TaskSchema);
