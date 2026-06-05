import Link from 'next/link';
import { PragatiMark } from '@/components/PragatiMark';
import { Shield, ArrowLeft, KeyRound, UserCog } from 'lucide-react';

export const metadata = { title: 'Forgot password' };

/**
 * Recovery guidance. Pragati uses workspace-managed credentials (no public
 * email/password reset), so account recovery flows through the admin — and
 * the admin recovers through the secure bootstrap setup. This page makes
 * both paths explicit instead of leaving a dead "forgot password" end.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#F4F7FB' }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <PragatiMark size={48} />
          <div className="brand-wordmark brand-wordmark-gradient text-2xl mt-3">Pragati</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <h1 className="text-lg font-black text-slate-900">Forgot your password?</h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Pragati keeps account access under your workspace’s control, so there’s no public
              email reset. Here’s how to get back in.
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Team members */}
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <UserCog size={16} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800">Team members &amp; leads</div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Ask your workspace admin to reset it. From <span className="font-semibold text-slate-700">People</span>,
                  they click <span className="font-semibold text-slate-700">Reset password</span> on your row and share the
                  temporary password — you’ll set your own on the next sign-in.
                </p>
              </div>
            </div>

            {/* Admin */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <Shield size={16} className="text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800">Workspace admin</div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  The admin is the single owner. If you've lost access, the platform operator
                  needs to reset your password directly — contact your IT/QA platform team and
                  share your workspace and email so they can restore your account.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
              <KeyRound size={13} className="shrink-0 mt-0.5" />
              <span>
                For security, Pragati never emails passwords. All resets force a fresh password on the
                next sign-in and are recorded in the admin operations log.
              </span>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-100">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-800">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
