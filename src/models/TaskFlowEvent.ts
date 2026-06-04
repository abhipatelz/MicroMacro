import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * FLOW SIGNAL Phase 1 — operational event stream.
 *
 * Every meaningful touch of a task (status change, comment, effort, subtask
 * toggle, QA sign-off, reassignment) is appended here as an immutable entry.
 * This is NOT the regulatory AuditLog (lib/audit.ts handles 21 CFR Part 11
 * attribution). This stream is for dashboard/analytics surfaces: "is this task
 * moving?", "when was it last meaningfully touched?", "who is active on it?".
 *
 * Privacy: events for tasks in personal projects or private-task overlays are
 * silently dropped by the recordTaskFlowEvent() helper — never recorded here.
 */
const TaskFlowEventSchema = new Schema(
  {
    taskId:    { type: Schema.Types.ObjectId, ref: 'Task',    required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    userId:    { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    eventType: {
      type: String,
      enum: [
        'status_changed',
        'comment_added',
        'effort_logged',
        'subtask_toggled',
        'qa_signoff',
        'assignee_changed',
      ],
      required: true,
    },
    payload:   { type: Schema.Types.Mixed, default: {} },
    recordedAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: false },
);

// Primary access patterns: drill-down per task (timeline), project-level
// aggregation (dashboard), and per-user activity rollup.
TaskFlowEventSchema.index({ taskId:    1, recordedAt: -1 });
TaskFlowEventSchema.index({ projectId: 1, recordedAt: -1 });
TaskFlowEventSchema.index({ userId:    1, recordedAt: -1 });

export type TaskFlowEventDoc = InferSchemaType<typeof TaskFlowEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TaskFlowEvent: Model<TaskFlowEventDoc> =
  (mongoose.models.TaskFlowEvent as Model<TaskFlowEventDoc>) ||
  mongoose.model<TaskFlowEventDoc>('TaskFlowEvent', TaskFlowEventSchema);
