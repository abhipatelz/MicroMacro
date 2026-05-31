'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { KeyRound, ShieldCheck, Sparkles } from 'lucide-react';

// Blocking, first-login Quick-PIN setup. Mandatory: it has no dismiss control,
// so a user cannot reach the app without choosing a PIN. The PIN never replaces
// the password — it only re-unlocks an idle session on this trusted device.
export function SetPinModal({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const valid = /^\d{4}$/.test(pin);
  const matches = pin === confirm;

  async function save() {
    if (!valid) { setErr('Your PIN must be exactly 4 digits.'); return; }
    if (!matches) { setErr('The two PINs don’t match.'); return; }
    setSaving(true); setErr('');
    try {
      await api('/auth/pin', { method: 'POST', body: { pin } });
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Could not save your PIN. Try a different one.');
      setSaving(false);
    }
  }

  const box = "input text-center font-black tracking-[0.6em] text-xl py-3 rounded-2xl border-blue-100 bg-white/90 shadow-sm focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
      <div className="relative overflow-hidden rounded-[28px] border border-white/60 bg-white/95 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.35)] w-full max-w-[420px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-blue-500/18 via-sky-300/10 to-emerald-400/18" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -left-14 top-16 h-32 w-32 rounded-full bg-blue-400/20 blur-2xl" />
        <div className="relative flex flex-col items-center text-center mb-5">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-[0_14px_32px_rgba(21,101,192,0.28)]">
            <KeyRound size={23} />
          </div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
            <Sparkles size={11} className="text-emerald-500" /> Trusted device
          </div>
          <h3 className="text-xl font-black text-slate-950">Set your Quick PIN</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-snug max-w-[320px]">
            Choose a 4-digit PIN for a smooth unlock experience. Your password is still
            required on new devices and after sign-out.
          </p>
        </div>

        <div className="relative space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-center">PIN</label>
            <input autoFocus type="password" inputMode="numeric" pattern="\d*" maxLength={4}
              className={box} placeholder="••••"
              value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-center">Confirm PIN</label>
            <input type="password" inputMode="numeric" pattern="\d*" maxLength={4}
              className={box} placeholder="••••"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && valid && matches) save(); }} />
          </div>

          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 leading-snug">{err}</div>
          )}

          <button onClick={save} disabled={!valid || !matches || saving}
            className="btn-primary w-full justify-center py-3 rounded-2xl shadow-[0_14px_30px_rgba(21,101,192,0.22)]">
            {saving ? 'Saving…' : 'Set PIN & continue'}
          </button>

          <p className="text-[11px] text-slate-400 leading-snug flex items-start gap-1.5 pt-1">
            <ShieldCheck size={13} className="text-slate-300 shrink-0 mt-0.5" />
            Stored securely (hashed), never shown again, and locked after several wrong tries.
          </p>
        </div>
      </div>
    </div>
  );
}
