import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// Marks the onboarding tour as seen for the currently authenticated user.
// Called once when the user dismisses the FirstTimeTour modal — after that
// the tour never re-appears for this account, regardless of browser.
export async function POST(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    await User.updateOne({ _id: user!.sub }, { hasSeenTour: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
