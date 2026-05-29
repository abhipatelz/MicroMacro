import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const UserSchema = new Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true },
    // Short login handle, à la Instagram. Required + unique for new accounts;
    // `sparse` allows the column to be added to a database that already has
    // documents without a username, so we can backfill at our leisure
    // (scripts/backfill-usernames.ts). Stored lower-cased and validated by
    // Zod in /lib/validations.ts so it stays case-insensitive and ASCII-safe.
    username:     { type: String, unique: true, sparse: true, lowercase: true, trim: true },
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

    // ── Admin recovery key ──────────────────────────────────────────────
    // bcrypt hash of a self-service recovery key the admin generates from
    // their profile. When the admin forgets their password they can type
    // this key into the password field on the login form and get straight
    // in (see src/app/api/auth/login/route.ts). Plaintext is shown exactly
    // once at generation time and never stored. Only meaningful on admins.
    securityKeyHash: { type: String, default: null },

    // ── Session control ─────────────────────────────────────────────────
    // sessionVersion is embedded in every JWT we sign. Bumping it instantly
    // invalidates every token previously issued for this user — used to
    // force-logout a user after an admin edits/locks/resets their account
    // (21 CFR Part 11 §11.10(d): access control stays under our control).
    sessionVersion: { type: Number, default: 0 },
    // activeSessionId is the id of the most recent successful login. A newer
    // login overwrites it, so any older token (carrying a different sid) is
    // rejected on its next request — enforcing one active session per user.
    activeSessionId: { type: String, default: null },

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
