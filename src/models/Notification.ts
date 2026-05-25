import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * In-app notification. There is no email/push delivery — these surface in
 * the bell dropdown in the app shell and (optionally) chime. Kept lean on
 * purpose: a recipient, a short message, an optional deep-link to a task,
 * and a read flag.
 */
const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:   { type: String, enum: ['task_assigned', 'task_done', 'task_waiting', 'general'], default: 'general' },
    title:  { type: String, required: true },
    body:   { type: String, default: '' },
    taskId:    { type: Schema.Types.ObjectId, ref: 'Task' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    read:   { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Fast "my unread, newest first" query.
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & { _id: mongoose.Types.ObjectId };

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ||
  mongoose.model<NotificationDoc>('Notification', NotificationSchema);
