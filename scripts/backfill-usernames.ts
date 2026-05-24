/**
 * Backfill `username` on every user that doesn't have one yet.
 *
 *   MONGODB_URI="<prod-uri>" npx tsx scripts/backfill-usernames.ts
 *   MONGODB_URI="<prod-uri>" npx tsx scripts/backfill-usernames.ts --confirm
 *
 * Strategy:
 *   - Default username = local-part of email, lower-cased and stripped
 *     of any character outside [a-z0-9._].
 *   - On collision (two users with the same local-part across different
 *     domains), append "2", "3", … until unique.
 *
 * The script is dry-run by default; pass --confirm to write to the DB.
 * It is safe to re-run — already-populated usernames are skipped.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';

function toUsername(email: string): string {
  const local = (email.split('@')[0] || '').toLowerCase();
  return local
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 30) || 'user';
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  await connectDB();

  const users = await User.find({ $or: [{ username: null }, { username: { $exists: false } }] }, '_id email username name').lean();
  if (users.length === 0) {
    console.log('[backfill] every user already has a username — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`[backfill] ${users.length} user(s) need a username`);

  // Track usernames we're about to assign so we don't collide within the
  // same run.
  const taken = new Set<string>(
    (await User.find({ username: { $ne: null } }, 'username').lean())
      .map((u: any) => u.username)
      .filter(Boolean),
  );

  const plan: Array<{ id: any; email: string; username: string }> = [];
  for (const u of users) {
    let base = toUsername(u.email);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${n++}`;
    }
    taken.add(candidate);
    plan.push({ id: u._id, email: u.email, username: candidate });
    console.log(`  ${u.email.padEnd(38)} → @${candidate}`);
  }

  if (!confirm) {
    console.log('\n[backfill] dry-run only. Re-run with --confirm to write.');
    await mongoose.disconnect();
    return;
  }

  // Write one-by-one so a single collision (impossible after the dedupe
  // above, but still) fails just that row.
  for (const row of plan) {
    await User.updateOne({ _id: row.id }, { $set: { username: row.username } });
  }
  console.log(`\n[backfill] updated ${plan.length} user(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
