import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { requireUser, requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { team as teamS } from '@/lib/serialize';

export const runtime = 'nodejs';

const Create = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  leadId: z.string().optional(),
  memberIds: z.array(z.string()).optional(),
  function: z
    .enum(['general', 'ctb', 'rtb', 'data_integrity', 'csv_validation', 'pharmacovigilance', 'lab_informatics', 'audit', 'training'])
    .optional()
});

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const teams = await Team.find({}).sort({ name: 1 }).lean();
    const counts = await Project.aggregate([{ $group: { _id: '$teamId', c: { $sum: 1 } } }]);
    const cmap = new Map(counts.map((c) => [String(c._id), c.c]));
    return NextResponse.json(
      teams.map((t) =>
        teamS(t, {
          memberCount: (t.memberIds || []).length,
          projectCount: cmap.get(String(t._id)) || 0
        })
      )
    );
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Create);
    const team = await Team.create({
      name: body.name,
      description: body.description || '',
      leadId: body.leadId || undefined,
      memberIds: body.memberIds || (body.leadId ? [body.leadId] : []),
      function: body.function || 'general'
    });
    return NextResponse.json(teamS(team));
  } catch (e) {
    return handleError(e);
  }
}
