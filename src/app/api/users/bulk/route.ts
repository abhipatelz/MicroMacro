import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { UsernameSchema } from '@/lib/validations';

export const runtime = 'nodejs';
// Each row costs one bcrypt hash (~80 ms). Capping at 100 keeps the request
// comfortably under the serverless time budget; import a larger roster in
// successive pastes.
export const maxDuration = 60;

const Row = z.object({
  username:   UsernameSchema,
  employeeId: z.string().trim().min(1).max(40),
  name:       z.string().trim().max(120).optional(),
  title:      z.string().trim().max(120).optional(),
});

const Body = z.object({
  rows: z.array(Row).min(1).max(100),
});

/** Same convention as the single-create flow:
 *  <firstname lower-cased>@<employee id>  e.g. "Priya Sharma" + 12345 → priya@12345 */
function defaultPassword(name: string, employeeId: string): string {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() || 'user';
  return `${first}@${employeeId.trim()}`;
}

function deriveName(username: string): string {
  return username
    .split(/[._]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ') || username;
}

/**
 * Bulk-create contributor accounts. Admin only. Partial success: each row
 * succeeds or fails independently, and the response reports exactly which.
 * Duplicates (by username, or by the synthesised email) are skipped, not
 * errored — re-running the same paste is safe.
 */
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();

    const { rows } = await readBody(req, Body);

    // One round-trip to find everything that already exists, plus in-batch
    // dedupe, so we never issue a query per row.
    const usernames = rows.map((r) => r.username);
    const emails    = usernames.map((u) => `${u}@pragati.local`);
    const existing  = await User.find(
      { $or: [{ username: { $in: usernames } }, { email: { $in: emails } }] },
      'username email',
    ).lean();
    const taken = new Set<string>();
    for (const e of existing) {
      if ((e as any).username) taken.add((e as any).username);
    }

    const created: Array<{ username: string; name: string }> = [];
    const skipped: Array<{ username: string; reason: string }> = [];
    const seenInBatch = new Set<string>();

    for (const r of rows) {
      if (seenInBatch.has(r.username)) {
        skipped.push({ username: r.username, reason: 'duplicate in list' });
        continue;
      }
      seenInBatch.add(r.username);

      if (taken.has(r.username)) {
        skipped.push({ username: r.username, reason: 'already exists' });
        continue;
      }

      const name       = r.name?.trim() || deriveName(r.username);
      const employeeId = r.employeeId.trim();
      try {
        await User.create({
          email:              `${r.username}@pragati.local`,
          username:           r.username,
          employeeId,
          name,
          passwordHash:       bcrypt.hashSync(defaultPassword(name, employeeId), 10),
          role:               'employee',
          title:              r.title || '',
          mustChangePassword: false,
        });
        created.push({ username: r.username, name });
      } catch {
        // Unique-index race or unexpected validation failure on this row.
        skipped.push({ username: r.username, reason: 'could not create' });
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  } catch (e) {
    return handleError(e);
  }
}
