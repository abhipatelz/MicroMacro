import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';

export const runtime = 'nodejs';

// Fields the user can always edit themselves
const EditableBody = z.object({
  title:       z.string().max(120).optional(),
  phone:       z.string().max(40).optional(),
  location:    z.string().max(80).optional(),
  // Notifications
  notifTaskAssigned:  z.boolean().optional(),
  notifTaskDueSoon:   z.boolean().optional(),
  notifTaskOverdue:   z.boolean().optional(),
  notifProjectUpdate: z.boolean().optional(),
});

// Fields locked when LDAP is synced (name, department, employeeId, managerName)
const ManualIdentityBody = z.object({
  name:         z.string().min(1).max(100).optional(),
  department:   z.string().max(100).optional(),
  employeeId:   z.string().max(50).optional(),
  managerName:  z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const user = await User.findById(jwt.sub).lean();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const user = await User.findById(jwt.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();
    const editable = EditableBody.safeParse(body);
    if (!editable.success) return NextResponse.json({ error: editable.error.issues[0].message }, { status: 400 });

    // Apply always-editable fields
    const d = editable.data;
    if (d.title       !== undefined) user.title       = d.title as any;
    if (d.phone       !== undefined) user.phone       = d.phone as any;
    if (d.location    !== undefined) user.location    = d.location as any;
    if (d.notifTaskAssigned  !== undefined) user.notifTaskAssigned  = d.notifTaskAssigned as any;
    if (d.notifTaskDueSoon   !== undefined) user.notifTaskDueSoon   = d.notifTaskDueSoon  as any;
    if (d.notifTaskOverdue   !== undefined) user.notifTaskOverdue   = d.notifTaskOverdue  as any;
    if (d.notifProjectUpdate !== undefined) user.notifProjectUpdate = d.notifProjectUpdate as any;

    // Apply identity fields only when NOT LDAP-synced
    if (!user.ldapSyncedAt) {
      const identity = ManualIdentityBody.safeParse(body);
      if (identity.success) {
        const id = identity.data;
        if (id.name        !== undefined) user.name        = id.name        as any;
        if (id.department  !== undefined) user.department  = id.department  as any;
        if (id.employeeId  !== undefined) user.employeeId  = id.employeeId  as any;
        if (id.managerName !== undefined) user.managerName = id.managerName as any;
      }
    }

    await user.save();
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}
