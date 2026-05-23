import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const UserSchema = new Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true },
    name:         { type: String, required: true },
    passwordHash: { type: String, required: true },
    // 'pm' kept in the enum for backwards compat with existing records;
    // new lead promotions use 'lead'. 'admin' is the single super-user
    // configured via the ADMIN_EMAIL env var. See src/lib/auth.ts.
    role:         { type: String, enum: ['employee', 'pm', 'lead', 'admin'], default: 'employee' },

    // ── Identity fields ─────────────────────────────────────────────────
    // These can be set manually or overwritten by LDAP sync.
    // When ldapSyncedAt is present, the UI shows them as read-only.
    title:        { type: String, default: '' },
    department:   { type: String, default: '' },
    employeeId:   { type: String, default: '' },   // e.g. sAMAccountName / employeeID from AD
    phone:        { type: String, default: '' },
    location:     { type: String, default: '' },   // office / site
    managerName:  { type: String, default: '' },   // display name of manager from AD

    // ── LDAP sync metadata ──────────────────────────────────────────────
    // Populated by the future LDAP sync job.
    // LDAP attribute → field mapping (Active Directory / OpenLDAP):
    //   displayName / cn        → name
    //   mail                    → email
    //   title                   → title
    //   department              → department
    //   employeeID / sAMAccountName → employeeId
    //   telephoneNumber         → phone
    //   l (locality)            → location
    //   manager (DN → resolved) → managerName
    //   distinguishedName       → ldapDn
    ldapDn:         { type: String, default: '' },   // Distinguished Name
    ldapSyncedAt:   { type: Date,   default: null },  // null = not yet synced
    ldapAttributes: { type: Schema.Types.Mixed, default: null }, // raw AD attrs for debugging

    // ── First-login flag ────────────────────────────────────────────────
    mustChangePassword: { type: Boolean, default: false },

    // ── Brute-force protection ──────────────────────────────────────────
    // After MAX_FAILED_LOGINS consecutive wrong passwords the account is
    // locked until an admin/lead clears it (via /api/users/[id]/unlock
    // or by resetting the password). lockedAt is the timestamp the lock
    // was applied — surfaced on the People page so admin can see *why*
    // a lead can't sign in.
    failedLoginAttempts: { type: Number, default: 0 },
    lockedAt:            { type: Date,   default: null },

    // ── Onboarding tour ─────────────────────────────────────────────────
    // Defaults to true so existing users don't see the tour on first
    // login after this change. The register + invite paths explicitly
    // set this to false so a fresh lead sees the tour exactly once.
    hasSeenTour: { type: Boolean, default: true },

    // ── Notification preferences ────────────────────────────────────────
    notifTaskAssigned:  { type: Boolean, default: true  },
    notifTaskDueSoon:   { type: Boolean, default: true  },  // 24h before due
    notifTaskOverdue:   { type: Boolean, default: true  },
    notifProjectUpdate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) || mongoose.model<UserDoc>('User', UserSchema);
