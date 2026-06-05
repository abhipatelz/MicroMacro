'use client';

import { BirdEyeIcon } from '@/components/BirdEyeIcon';

/**
 * Standardised trigger for the Bird's-Eye view. Same icon, same dimensions
 * everywhere in the app — so the feature is recognisable across Dashboard,
 * project pages and team pages. (No attention blink: the icon sits quietly
 * and is discovered through use, keeping the surface calm.)
 */
export function BirdEyeButton({
  onClick,
  scopeKey: _scopeKey = 'default',
  size = 18,
  className = '',
}: {
  onClick: () => void;
  /** Retained for call-site compatibility; no longer used. */
  scopeKey?: string;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Bird's-eye view"
      aria-label="Open bird's-eye view"
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors ${className}`.trim()}
    >
      <BirdEyeIcon size={size} />
    </button>
  );
}
