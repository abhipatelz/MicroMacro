import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * Workspace-wide configuration for the daily "tasks due today" email digest.
 *
 * Stored as a SINGLE document (`_id: 'global'`) that an admin edits from
 * Settings. It controls WHAT each personal digest contains and whether digests
 * are sent at all. This is configuration data (GAMP 5 Cat 4) — it tunes a
 * convenience notification and never creates, modifies, or signs a controlled
 * GxP record, so it carries no e-record / e-signature obligation. Each save is
 * still stamped with who/when (updatedByName + timestamps) for operational
 * traceability.
 *
 * Defaults are deliberately conservative: only the assignee's own tasks that
 * are due today or overdue are included, and the master switch is on but the
 * per-user opt-in (User.notifDailyDigest) defaults OFF — so nothing is emailed
 * until a person explicitly enables it in their profile.
 */
const DigestSettingSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    // Master switch — when false, the scheduled job sends nothing at all.
    enabled: { type: Boolean, default: true },
    // Content sections (each rendered only when enabled AND non-empty).
    dueToday: { type: Boolean, default: true },
    overdue: { type: Boolean, default: true },
    // Tasks due within the next N days (0 = section off). Bounded so the email
    // can never balloon into an unbounded look-ahead.
    dueSoonDays: { type: Number, default: 0, min: 0, max: 14 },
    // Projects in the recipient's scope with work completed in the last 24h.
    projectUpdates: { type: Boolean, default: false },
    // When false, recipients with nothing to report are skipped (no empty mail).
    sendWhenEmpty: { type: Boolean, default: false },
    // Optional short message the admin can place at the top of every digest.
    introNote: { type: String, default: '', maxlength: 500 },
    // Light operational provenance (not a regulated e-signature).
    updatedByName: { type: String, default: '' },
    // Stats from the most recent REAL (non-test) run — written by the
    // scheduled/manual sender so the admin panel can show delivery health
    // and free-tier cap headroom without a separate log query.
    lastRunAt: { type: Date, default: null },
    lastRunSummary: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export type DigestSettingDoc = InferSchemaType<typeof DigestSettingSchema> & { _id: string };

export const DigestSetting: Model<DigestSettingDoc> =
  (mongoose.models.DigestSetting as Model<DigestSettingDoc>) ||
  mongoose.model<DigestSettingDoc>('DigestSetting', DigestSettingSchema);
