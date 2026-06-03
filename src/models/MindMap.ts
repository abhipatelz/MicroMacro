import mongoose, { Schema, InferSchemaType } from 'mongoose';

/**
 * One mind-map document per user. The whole graph (nodes + edges) lives in
 * a single document because:
 *   - It's a single-user surface (no cross-user reads, no joins needed)
 *   - The graphs are small (rarely more than a few hundred nodes)
 *   - Atomic save semantics are easier when the whole document moves at once
 *
 * Sub-documents intentionally have `_id: false` — the client supplies stable
 * string ids, and storing extra ObjectIds would just bloat the document.
 */
const MMNodeSchema = new Schema({
  id:    { type: String, required: true },
  x:     { type: Number, required: true },
  y:     { type: Number, required: true },
  text:  { type: String, default: '' },
  color: { type: String, default: '' },
}, { _id: false });

const MMEdgeSchema = new Schema({
  id:   { type: String, required: true },
  from: { type: String, required: true },
  to:   { type: String, required: true },
}, { _id: false });

const MindMapSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  nodes:  { type: [MMNodeSchema], default: [] },
  edges:  { type: [MMEdgeSchema], default: [] },
}, { timestamps: true });

MindMapSchema.index({ userId: 1 }, { unique: true });

export type MindMapDoc = InferSchemaType<typeof MindMapSchema>;
export const MindMap = (mongoose.models.MindMap as mongoose.Model<MindMapDoc>) ||
  mongoose.model<MindMapDoc>('MindMap', MindMapSchema);
