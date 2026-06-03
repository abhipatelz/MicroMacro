import { connectDB } from '@/lib/db';
import { Invite } from '@/models/Invite';
import SignupClient from './SignupClient';

export const runtime = 'nodejs';

interface InviteState {
  valid: boolean;
  email?: string;
  invitedByName?: string;
  reason?: string;
}

// Server component: validates the invite token during SSR so the form renders
// with content on the first byte — eliminating the client-side waterfall that
// previously kept the page at opacity:0 (loader) until the /api/invites/validate
// round-trip resolved. LCP improvement: invite validation is now free.
export default async function SignupPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token || '';

  let initialState: InviteState = { valid: false, reason: 'missing_token' };

  if (token) {
    try {
      await connectDB();
      const invite = await Invite.findOne({ token }).lean() as any;
      if (!invite) {
        initialState = { valid: false, reason: 'not_found' };
      } else if (invite.revokedAt) {
        initialState = { valid: false, reason: 'revoked' };
      } else if (invite.consumedAt) {
        initialState = { valid: false, reason: 'consumed' };
      } else if (new Date(invite.expiresAt) < new Date()) {
        initialState = { valid: false, reason: 'expired' };
      } else {
        initialState = {
          valid: true,
          email: invite.email,
          invitedByName: invite.invitedByName || '',
        };
      }
    } catch {
      initialState = { valid: false, reason: 'error' };
    }
  }

  return <SignupClient token={token} initialState={initialState} />;
}
