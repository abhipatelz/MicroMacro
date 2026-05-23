/**
 * Pre-launch cleanup: delete every user account that was NOT created via the
 * invite flow. Pre-launch seed data and any test accounts are removed; only
 * the founding lead (the first registered account, via /auth/register) and
 * everyone with a consumed invite record survive.
 *
 * Run once before opening the workspace to the real team:
 *
 *   npx tsx scripts/cleanup-users.ts            # dry-run
 *   npx tsx scripts/cleanup-users.ts --confirm  # actually delete
 *
 * The dry-run lists every account that would be deleted, with the reason,
 * before doing anything destructive.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Invite } from '@/models/Invite';

async function main() {
  const confirm = process.argv.includes('--confirm');

  await connectDB();

  const users   = await User.find({}, '_id name email role createdAt').lean();
  const invites = await Invite.find({ consumedByUserId: { $ne: null } }, 'consumedByUserId').lean();
  const invitedUserIds = new Set(invites.map(i => String(i.consumedByUserId)));

  // The very first registered account (the workspace founder) survives even
  // without an invite — that's how /auth/register is intended to work.
  const sorted = [...users].sort((a, b) =>
    new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime(),
  );
  const founderId = sorted[0]?._id ? String(sorted[0]._id) : null;

  const toKeep: typeof users   = [];
  const toDrop: typeof users   = [];
  for (const u of users) {
    const id = String(u._id);
    if (id === founderId)          { toKeep.push(u); continue; }
    if (invitedUserIds.has(id))    { toKeep.push(u); continue; }
    toDrop.push(u);
  }

  console.log(`\n[cleanup] surveyed ${users.length} user(s)`);
  console.log(`  keep: ${toKeep.length}`);
  for (const u of toKeep) console.log(`    ✓ ${u.email.padEnd(36)} (${u.role})  ${u.name}`);
  console.log(`  drop: ${toDrop.length}`);
  for (const u of toDrop) console.log(`    ✗ ${u.email.padEnd(36)} (${u.role})  ${u.name}`);

  if (toDrop.length === 0) {
    console.log('\n[cleanup] nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (!confirm) {
    console.log('\n[cleanup] dry-run only. Re-run with --confirm to actually delete.');
    await mongoose.disconnect();
    return;
  }

  const ids = toDrop.map(u => u._id);
  const res = await User.deleteMany({ _id: { $in: ids } });
  console.log(`\n[cleanup] deleted ${res.deletedCount} user(s).`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
