import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { MindMap } from '@/models/MindMap';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  nodes: z.array(z.object({
    id:    z.string().max(40),
    x:     z.number().finite(),
    y:     z.number().finite(),
    text:  z.string().max(200).optional().default(''),
    color: z.string().max(20).optional().default(''),
  })).max(500),
  edges: z.array(z.object({
    id:   z.string().max(40),
    from: z.string().max(40),
    to:   z.string().max(40),
  })).max(2000),
});

/**
 * GET — return the current user's mind map (creates an empty doc lazily).
 * PUT — replace the whole graph atomically.
 *
 * The graph is private to the owner — there's no query that lets another
 * user (including admin) read someone else's mind map. This is a personal
 * scratchpad, never an organisational record.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const doc = await MindMap.findOne({ userId: user!.sub }).lean();
    return NextResponse.json({
      nodes: doc?.nodes || [],
      edges: doc?.edges || [],
      updatedAt: (doc as any)?.updatedAt || null,
    });
  } catch (e) { return handleError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    // Server-side trust boundary: a node's id may appear in an edge only if
    // it's listed in `nodes`. Strip orphan edges defensively so a stale
    // client can't accumulate garbage in the document.
    const ids = new Set(body.nodes.map((n) => n.id));
    const clean = body.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
    const doc = await MindMap.findOneAndUpdate(
      { userId: user!.sub },
      { $set: { nodes: body.nodes, edges: clean } },
      { upsert: true, new: true },
    ).lean();
    return NextResponse.json({
      nodes: doc?.nodes || [],
      edges: doc?.edges || [],
      updatedAt: (doc as any)?.updatedAt || null,
    });
  } catch (e) { return handleError(e); }
}
