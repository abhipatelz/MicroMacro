import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * "My Day" scratch note — a personal brain-dump line, owned by one user.
 *
 * Deliberately NOT a generic to-do: the differentiator is that any line can
 * be promoted into a real, tracked project task (see the my-day page). It's
 * the bridge from "thought in my head" → "work the platform tracks", which
 * a plain checklist app can't do.
 *
 * Unfinished notes simply persist (they "carry over" day to day); there's
 * no date bucketing to keep it frictionless.
 */
const ScratchNoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text:   { type: String, required: true, maxlength: 2000 },
    done:   { type: Boolean, default: false },
    // If the note was promoted into a task, remember which — lets the UI
    // show a quiet "→ tracked" link instead of re-promoting.
    promotedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true },
);

ScratchNoteSchema.index({ userId: 1, done: 1, createdAt: -1 });

export type ScratchNoteDoc = InferSchemaType<typeof ScratchNoteSchema> & { _id: mongoose.Types.ObjectId };

export const ScratchNote: Model<ScratchNoteDoc> =
  (mongoose.models.ScratchNote as Model<ScratchNoteDoc>) ||
  mongoose.model<ScratchNoteDoc>('ScratchNote', ScratchNoteSchema);
