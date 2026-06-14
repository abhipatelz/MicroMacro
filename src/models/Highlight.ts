import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * Profile "Highlight" — a story-style card, but TEXT only (no images).
 *
 * The idea, reasoned from how people actually share progress: an Instagram
 * story is a glanceable, tappable highlight of "what I'm up to". Ported to a
 * work tool, the high-value version isn't a photo — it's a sentence or two on
 * what you're building, an insight from a project, or a goal worth rallying
 * around. Persistent (these are highlights worth keeping, not 24h ephemera),
 * owned by one user, shown as rings at the top of their profile.
 *
 * Deliberately tiny: a title, an optional body, and an accent colour. No
 * media, no attachments — that keeps it minimal and free-forever (nothing to
 * store but a little text).
 */
const HighlightSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // The one-line headline shown on the ring and at the top of the card.
    title: { type: String, required: true, maxlength: 60 },
    // Optional supporting lines — the insight / detail.
    body: { type: String, default: '', maxlength: 280 },
    // One of a small, curated palette (validated in the API). Drives the ring
    // gradient and the viewer card accent.
    accent: { type: String, default: 'blue' },
    // Lightweight encouragement from colleagues — one reaction per member
    // (enforced in the API), from a curated emoji set. Embedded because a
    // highlight's reactions are always read with the highlight and never
    // queried on their own, and volume is workspace-scale (small).
    reactions: {
      type: [
        {
          _id: false,
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          emoji: { type: String, required: true },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

HighlightSchema.index({ userId: 1, createdAt: -1 });

export type HighlightDoc = InferSchemaType<typeof HighlightSchema> & { _id: mongoose.Types.ObjectId };

export const Highlight: Model<HighlightDoc> =
  (mongoose.models.Highlight as Model<HighlightDoc>) ||
  mongoose.model<HighlightDoc>('Highlight', HighlightSchema);
