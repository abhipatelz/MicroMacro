'use client';

import { useEffect, useState } from 'react';
import { BirdEyeIcon } from '@/components/BirdEyeIcon';

/**
 * Standardised trigger for the Bird's-Eye view. Same icon, same dimensions,
 * same blink-on-discovery behaviour everywhere in the app — so the feature is
 * recognisable across Dashboard, project pages and team pages.
 *
 * The icon pulses *once per session per scope* (keyed via sessionStorage) so a
 * lead opening five projects in a row isn't subjected to five blinks; the cue
 * shows where the feature lives without becoming noise.
 */
export function BirdEyeButton({
  onClick,
  scopeKey = 'default',
  size = 18,
  className = '',
}: {
  onClick: () => void;
  /** Distinct cue key per surface (e.g. "dashboard", "project", "team"). */
  scopeKey?: string;
  size?: number;
  className?: string;
}) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const k = `pragati-bve-cue:${scopeKey}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
    setBlink(true);
    const t = setTimeout(() => setBlink(false), 2300);
    return () => clearTimeout(t);
  }, [scopeKey]);

  return (
    <button
      type="button"
      onClick={onClick}
      title="Bird's-eye view"
      aria-label="Open bird's-eye view"
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors ${className}`.trim()}
    >
      <BirdEyeIcon size={size} blink={blink} />
    </button>
  );
}
