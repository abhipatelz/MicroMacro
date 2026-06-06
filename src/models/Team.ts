import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const TeamSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    leadId: { type: Schema.Types.ObjectId, ref: 'User' },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Operating function: general, ctb (change the business), rtb (run the
    // business). Legacy informatics values kept in the enum so historical
    // teams still load/save.
    function: {
      type: String,
      enum: ['general', 'ctb', 'rtb', 'data_integrity', 'csv_validation', 'pharmacovigilance', 'lab_informatics', 'audit', 'training'],
      default: 'general'
    },
    // Custom team avatar: base-64 encoded JPEG, ~128 px, resized client-side
    // before upload. Excluded from list queries via select('-avatarImage') so
    // it never bloats the teams index. Retrieved only on the team detail page.
    avatarImage: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

TeamSchema.index({ leadId: 1 });
TeamSchema.index({ memberIds: 1 });

export type TeamDoc = InferSchemaType<typeof TeamSchema> & { _id: mongoose.Types.ObjectId };

export const Team: Model<TeamDoc> =
  (mongoose.models.Team as Model<TeamDoc>) || mongoose.model<TeamDoc>('Team', TeamSchema);
