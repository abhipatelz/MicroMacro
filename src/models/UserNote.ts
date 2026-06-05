import mongoose, { Schema } from 'mongoose';

const UserNoteSchema = new Schema(
  {
    userId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:   { type: String, trim: true },
    content: { type: String, required: true, trim: true },
    type:    { type: String, enum: ['text', 'whiteboard'], default: 'text' },
    /** Stored only for whiteboard-type notes — the raw stroke list. */
    whiteboardData: { type: Schema.Types.Mixed },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Compound index for the list endpoint: it always queries by userId, then
// sorts by pinned ↓ + updatedAt ↓. With this index Mongo can satisfy the
// whole query (filter + sort) without a separate in-memory sort pass.
UserNoteSchema.index({ userId: 1, pinned: -1, updatedAt: -1 });

export default mongoose.models.UserNote || mongoose.model('UserNote', UserNoteSchema);
