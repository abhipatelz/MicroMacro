import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness + readiness probe.
 *
 * - 200 → process is up AND Mongo responded to a ping within ~2s.
 *   Point uptime monitors (UptimeRobot, BetterUptime) at this URL.
 * - 503 → DB unreachable; the platform should stop routing new traffic
 *   to this instance until it recovers.
 *
 * Deliberately returns nothing sensitive (no env values, no commit
 * SHA, no uptime). For a richer status page build a separate authed
 * /api/admin/status route — never extend this one.
 */
export async function GET() {
  const start = Date.now();
  try {
    await connectDB();
    await Promise.race([
      mongoose.connection.db?.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 2000)),
    ]);
    return NextResponse.json(
      { ok: true, db: 'up', latencyMs: Date.now() - start },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
