import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * Append-only stream of meaningful work-flow events.
 *
 * Lives alongside (NOT inside) the compliance AuditLog so that the analytics
 * pipeline can mine, archive and re-derive aggregates over this collection
 * without ever touching the GxP audit trail. AuditLog stays canonical for
 * "who did what to a record"; TaskFlowEvent answers "did this task actually
 * move, and when".
 *
 * Metadata is deliberately bounded — bounded reason codes, counts, state
 * names, ObjectIds. Free-text content (comment bodies, descriptions) MUST
 * stay in their original document; we never copy them here. That keeps a
 * future archive job simple, keeps PII surface small, and means a privacy
 * incident on the original text doesn't have to chase through this stream.
 *
 * schemaVersion is recorded from day one so the shape can evolve safely
 * once we have real usage history to train on.
 */
const TaskFlowEventSchema = new Schema(
  {
    schemaVersion: { type: Number, default: 1, required: true },
    // Scoping keys — kept flat so a future cross-tenant index never has to
    // walk into a nested doc. `scopeKey` is the workspace identifier; in
    // single-tenant mode we use 'default' but the field is reserved.
    scopeKey:  { type: String, default: 'default', index: true },
    teamId:    { type: Schema.Types.ObjectId, ref: 'Team' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    taskId:    { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    actorId:   { type: Schema.Types.ObjectId, ref: 'User' },

    eventType: {
      type: String,
      enum: [
        'task_created',
        'task_assigned',
        'task_reassigned',
        'status_changed',
        'comment_added',
        'subtask_created',
        'subtask_progressed',
        'effort_logged',
        'signoff_completed',
        'waiting_confirmed',
        'waiting_cleared',
        'decision_requested',
        'help_requested',
        'still_moving_confirmed',
        'prompt_dismissed',
        'prompt_eligible_shadow',
        'prompt_shown_live',
        'prompt_opened',
        'task_completed',
      ],
      required: true,
      index: true,
    },

    stateBefore: { type: String },
    stateAfter:  { type: String },

    // Light-weight context that lets baselines & process-mining segment by
    // task type / project lifecycle without re-joining to Task.
    taskType:         { type: String },
    projectLifecycle: { type: String },

    occurredAt: { type: Date, default: Date.now, required: true, index: true },

    // 'live'        — recorded by the application at the moment the event
    //                 actually happened (the only source we train ML on
    //                 without caveats).
    // 'backfill_approx' — derived from existing records during a migration;
    //                 approximate, must stay distinguishable so the training
    //                 pipeline can weight or exclude it.
    // 'shadow'      — synthetic event written by an evaluation harness; never
    //                 used as ground truth.
    source: {
      type: String,
      enum: ['live', 'backfill_approx', 'shadow'],
      default: 'live',
      required: true,
    },

    // Bounded reason codes / small enum-like fields. NEVER copy free text here.
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Hot read patterns:
//   - per-task history newest-first (task-detail timeline, idle calc)
//   - per-scope event-type slicing (training data fetch)
//   - per-scope per-project rolling windows (drift / baselines)
TaskFlowEventSchema.index({ taskId: 1, occurredAt: -1 });
TaskFlowEventSchema.index({ scopeKey: 1, eventType: 1, occurredAt: -1 });
TaskFlowEventSchema.index({ scopeKey: 1, projectId: 1, occurredAt: -1 });

export type TaskFlowEventDoc = InferSchemaType<typeof TaskFlowEventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const TaskFlowEvent: Model<TaskFlowEventDoc> =
  (mongoose.models.TaskFlowEvent as Model<TaskFlowEventDoc>) ||
  mongoose.model<TaskFlowEventDoc>('TaskFlowEvent', TaskFlowEventSchema);
