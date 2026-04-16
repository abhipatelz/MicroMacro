import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const TeamSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    leadId: { type: Schema.Types.ObjectId, ref: 'User' },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // informatics function: data_integrity, csv_validation, pv, lab, audit, training
    function: {
      type: String,
      enum: ['data_integrity', 'csv_validation', 'pharmacovigilance', 'lab_informatics', 'audit', 'training', 'general'],
      default: 'general'
    }
  },
  { timestamps: true }
);

export type TeamDoc = InferSchemaType<typeof TeamSchema> & { _id: mongoose.Types.ObjectId };

export const Team: Model<TeamDoc> =
  (mongoose.models.Team as Model<TeamDoc>) || mongoose.model<TeamDoc>('Team', TeamSchema);
