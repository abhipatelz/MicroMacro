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

const TaskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    phaseId: { type: Schema.Types.ObjectId },
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

    subtasks: { type: [SubtaskSchema], default: [] },
    comments: { type: [CommentSchema], default: [] }
  },
  { timestamps: true }
);

TaskSchema.index({ assigneeId: 1 });
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ dueDate: 1 });

export type TaskDoc = InferSchemaType<typeof TaskSchema> & { _id: mongoose.Types.ObjectId };

export const Task: Model<TaskDoc> =
  (mongoose.models.Task as Model<TaskDoc>) || mongoose.model<TaskDoc>('Task', TaskSchema);
