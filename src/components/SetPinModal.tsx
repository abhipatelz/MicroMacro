'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { KeyRound, ShieldCheck } from 'lucide-react';

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

  const box = "input text-center font-black tracking-[0.6em] text-xl py-3";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-[400px] p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
            <KeyRound size={22} className="text-blue-600" />
          </div>
          <h3 className="text-lg font-black text-slate-900">Set your Quick PIN</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-snug max-w-[300px]">
            Choose a 4-digit PIN to jump back in quickly next time — no need to retype
            your password every visit. Your password is still required on a new device.
          </p>
        </div>

        <div className="space-y-3">
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
            className="btn-primary w-full justify-center py-2.5">
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
