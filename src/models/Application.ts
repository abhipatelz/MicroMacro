import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

// An Application is a piece of business software the Quality Informatics
// team owns (examples at Alembic: LIMS, MES, TrackWise, Documentum, IDP
// Logbook). Every Project lives under exactly one Application, and every
// Application has an "owner" (the DGM / delivery manager accountable for
// it) plus a set of members who can be assigned tasks.
//
// This is what turns the tool from "generic PM" into "Quality Informatics
// PM" — it mirrors exactly how the team is organized in real life and is
// the unit at which DGMs track progress and spot bottlenecks.

const ApplicationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    vendor: { type: String, default: '' },
    description: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['operational', 'under_implementation', 'under_upgrade', 'retired'],
      default: 'operational'
    },
    defaultLifecycle: {
      type: String,
      enum: [
        'csv',
        'sop',
        'deviation_capa',
        'change_control',
        'audit',
        'validation',
        'data_integrity',
        'pharmacovigilance',
        'generic'
      ],
      default: 'csv'
    },
    // regulatory/business impact tags -- used for dashboards and priority hints
    gxp: { type: Boolean, default: true },
    tags: [{ type: String }]
  },
  { timestamps: true }
);

export type ApplicationDoc = InferSchemaType<typeof ApplicationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Application: Model<ApplicationDoc> =
  (mongoose.models.Application as Model<ApplicationDoc>) ||
  mongoose.model<ApplicationDoc>('Application', ApplicationSchema);
