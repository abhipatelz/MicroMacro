'use client';
import Link from 'next/link';
import { ReactNode, useEffect, useRef, useState } from 'react';

// ── Status dots ───────────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  todo:        '#94a3b8',
  in_progress: '#3b82f6',
  review:      '#f59e0b',
  blocked:     '#ef4444',
  done:        '#22c55e',
  planning:    '#94a3b8',
  on_hold:     '#f59e0b',
  completed:   '#22c55e',
  cancelled:   '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  todo:        'Todo',
  in_progress: 'In progress',
  review:      'Review',
  blocked:     'Blocked',
  done:        'Done',
  planning:    'Planning',
  on_hold:     'On hold',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

export const STATUS_COLORS: Record<string, string> = {
  todo:        'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  review:      'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  blocked:     'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  done:        'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  planning:    'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  on_hold:     'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  completed:   'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  cancelled:   'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low:      'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400',
  medium:   'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  high:     'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

const PRIORITY_DOT: Record<string, string> = {
  low:      '#94a3b8',
  medium:   '#0ea5e9',
  high:     '#f97316',
  critical: '#ef4444',
};

export const LIFECYCLE_LABELS: Record<string, string> = {
  // Generic templates
  agile_sprint:      'Sprint',
  software_release:  'Release',
  product_launch:    'Launch',
  research:          'Research',
  // Life Sciences templates
  csv:               'CSV',
  sop:               'SOP',
  deviation:         'Deviation',
  capa:              'CAPA',
  deviation_capa:    'Issue/CAPA',
  change_control:    'Change Control',
  software_change:   'SW Change',
  audit:             'Audit',
  validation:        'Validation',
  data_integrity:    'Data Integrity',
  pharmacovigilance: 'Safety Reporting',
  generic:           'Generic',
};

export const LIFECYCLE_COLORS: Record<string, string> = {
  // Generic templates
  agile_sprint:      'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/15',
  software_release:  'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/15',
  product_launch:    'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-500/15',
  research:          'text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-500/15',
  // Life Sciences templates
  csv:               'text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/15',
  sop:               'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15',
  deviation:         'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/15',
  capa:              'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-500/15',
  deviation_capa:    'text-red-600 bg-red-50 dark:text-red-300 dark:bg-red-500/15',
  change_control:    'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15',
  software_change:   'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/15',
  audit:             'text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-500/15',
  validation:        'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-500/15',
  data_integrity:    'text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-500/15',
  pharmacovigilance: 'text-pink-700 bg-pink-50 dark:text-pink-300 dark:bg-pink-500/15',
  generic:           'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-white/10',
};

export const SEVERITY_COLORS: Record<string, string> = {
  minor:    'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
  major:    'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

export const RISK_COLORS: Record<string, string> = {
  low:    'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  medium: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  high:   'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

// ── Tag primitives ────────────────────────────────────────────────────────────
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

/* ── Role badge — the only thing we show for a person besides their name.
   No job titles or designations anywhere: a person is a Team Lead
   (green), an Individual Contributor (blue), or the Admin (amber). */
export const ROLE_LABEL: Record<string, string> = {
  admin:    'Admin',
  pm:       'Team Lead',
  lead:     'Team Lead',
  contributor: 'Individual Contributor',
  employee: 'Individual Contributor',
};
const ROLE_BADGE_CLASS: Record<string, string> = {
  admin:       'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25',
  pm:          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25',
  lead:        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25',
  contributor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25',
  employee:    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25',
};
export function roleLabel(role?: string | null): string {
  return ROLE_LABEL[role || 'contributor'] ?? 'Individual Contributor';
}
export function RoleBadge({ role, className = '' }: { role?: string | null; className?: string }) {
  const r = role || 'contributor';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${ROLE_BADGE_CLASS[r] ?? ROLE_BADGE_CLASS.contributor} ${className}`}>
      {roleLabel(r)}
    </span>
  );
}

export function StatusTag({ status }: { status?: string | null }) {
  if (!status) return null;
  const dot = STATUS_DOT[status] ?? '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-white/60">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      {STATUS_LABEL[status] ?? status.replace('_', ' ')}
    </span>
  );
}

export function PriorityTag({ priority }: { priority?: string | null }) {
  if (!priority || priority === 'low') return null;
  const dot = PRIORITY_DOT[priority] ?? '#94a3b8';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold ${PRIORITY_COLORS[priority] ?? 'bg-slate-100 text-slate-600'}`}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      {priority}
    </span>
  );
}

export function LifecycleTag({ lifecycle }: { lifecycle?: string | null }) {
  if (!lifecycle || lifecycle === 'generic') return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LIFECYCLE_COLORS[lifecycle] ?? 'bg-slate-100 text-slate-600'}`}>
      {LIFECYCLE_LABELS[lifecycle] ?? lifecycle}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`relative w-full bg-slate-100 dark:bg-white/10 rounded-full h-1 overflow-hidden ${className}`}>
      <div
        className="progress-bar-fill h-1 rounded-full"
        // Spring-like easing so the fill glides into place rather than a flat
        // linear crawl — reads as "progress made", not a loading bar.
        style={{ width: `${pct}%`, transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        {/* Travelling sheen — only while there's something to show. */}
        {pct > 0 && pct < 100 && <span aria-hidden className="progress-bar-sheen" />}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ title, hint, principle }: {
  title: string;
  hint?: string;
  principle?: string;
}) {
  return (
    <div className="text-center py-10 text-slate-400">
      <div className="text-xl mb-2 opacity-30">◈</div>
      <div className="text-sm font-medium text-slate-500">{title}</div>
      {hint && <div className="text-xs mt-1.5 text-slate-400 max-w-xs mx-auto leading-relaxed">{hint}</div>}
      {principle && (
        <div className="mt-3 text-[10px] uppercase tracking-widest text-slate-300 font-bold">{principle}</div>
      )}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────
export function formatDate(s?: string | Date | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function daysUntil(s?: string | Date | null) {
  if (!s) return null;
  const d = typeof s === 'string' && s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

// ── Avatar ────────────────────────────────────────────────────────────────────
// Each palette entry is a [lighter, darker] gradient pair for a soft 3-D feel.
const AVATAR_GRADIENTS: Array<[string, string]> = [
  ['#1E88E5', '#1565C0'], // brand blue
  ['#5E35B1', '#311B92'], // deep purple
  ['#00897B', '#00695C'], // teal
  ['#EF6C00', '#E65100'], // orange
  ['#43A047', '#2E7D32'], // forest
  ['#C62828', '#B71C1C'], // red
  ['#039BE5', '#0277BD'], // light blue
  ['#7B1FA2', '#4A148C'], // purple
  ['#6D4C41', '#4E342E'], // warm brown
  ['#546E7A', '#37474F'], // blue grey
];

// User-pickable monogram backgrounds. A richer palette so the picker feels
// expressive without leaving the brand's calm tone: 6 groups (pastels, vivids,
// jewels, earth, mono, brand-accent) × 4 hues each. The editor groups them
// visually so the choice feels curated, not a sea of swatches.
export const AVATAR_MONOGRAM_BG: string[] = [
  // Pastels — soft, friendly defaults
  '#F8BBD9', '#FDBA74', '#FDE047', '#86EFAC',
  '#7DD3FC', '#C4B5FD', '#FCA5A5', '#A7F3D0',
  '#FBCFE8', '#FED7AA', '#FEF08A', '#BAE6FD',
  // Vivid — punchier saturation
  '#EC4899', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#8B5CF6', '#EF4444', '#10B981',
  // Jewel — deep, rich tones
  '#9333EA', '#0EA5E9', '#059669', '#B91C1C',
  '#7C2D12', '#0F766E', '#1D4ED8', '#A21CAF',
  // Earth — warm neutrals
  '#A16207', '#854D0E', '#365314', '#1E3A8A',
  // Mono — professional grayscale
  '#0F172A', '#334155', '#64748B', '#CBD5E1',
  // Brand accents — Pragati gradient stops
  '#1565C0', '#1976D2', '#2E7D32', '#0D47A1',
];

// Font choices for the monogram letter. Curated typefaces that always read
// well at the small sizes avatars live in — a wider variety than the original
// 5 system fallbacks. Sample strings show the actual character shape.
export const AVATAR_FONTS: Array<{ family: string; weight: number; sample: string }> = [
  // Sans-serif — the workhorse defaults
  { family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',         weight: 700, sample: 'Aa' },
  { family: '"Helvetica Neue", Helvetica, Arial, sans-serif',                   weight: 800, sample: 'Aa' },
  { family: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',                weight: 700, sample: 'Aa' },
  { family: '"Avenir Next", Avenir, "Segoe UI", sans-serif',                    weight: 600, sample: 'Aa' },
  // Display / heavy — strong, confident
  { family: 'Impact, "Arial Black", sans-serif',                                weight: 900, sample: 'Aa' },
  { family: '"Futura", "Trebuchet MS", sans-serif',                             weight: 700, sample: 'Aa' },
  // Serif — classic
  { family: 'Georgia, "Times New Roman", serif',                                weight: 700, sample: 'Aa' },
  { family: '"Playfair Display", Georgia, serif',                               weight: 700, sample: 'Aa' },
  { family: '"Garamond", "Times New Roman", serif',                             weight: 600, sample: 'Aa' },
  // Slab / mono — technical, GxP-flavoured
  { family: '"Courier New", ui-monospace, monospace',                           weight: 700, sample: 'Aa' },
  { family: '"Rockwell", "Courier New", serif',                                 weight: 700, sample: 'Aa' },
  // Script / handwritten — for a personal touch
  { family: '"Brush Script MT", "Lucida Handwriting", cursive',                 weight: 400, sample: 'Aa' },
  { family: '"Snell Roundhand", "Apple Chancery", cursive',                     weight: 500, sample: 'Aa' },
];

// Pick a sensible foreground for a given background — black for light pastels,
// white for dark fills. Keeps the letter readable across the palette.
export function avatarFg(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length !== 6) return '#111';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived luminance, ITU-R BT.709
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 170 ? '#1f2937' : '#ffffff';
}

interface AvatarProps {
  name?: string | null;
  size?: number;
  /** Custom monogram letter — overrides the name-derived initials. */
  letter?: string | null;
  /** Solid background colour. When set, replaces the hash-derived gradient. */
  bg?: string | null;
  /** Index into AVATAR_FONTS. */
  font?: number | null;
  /** When true, wraps the avatar in a brand-gradient ring (Insta-story style). */
  ring?: boolean;
}

export function Avatar({ name, size = 28, letter, bg, font, ring }: AvatarProps) {
  // Initials: first letter of first word + first letter of last word.
  // Single-word names render a single letter. Coloured deterministically by name.
  const trimmed = (name || '').trim();
  const parts   = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
  const first   = (parts[0]?.[0] || '?').toUpperCase();
  const last    = parts.length > 1 ? (parts[parts.length - 1][0] || '').toUpperCase() : '';
  const defaultInitials = (first + last) || '?';
  const initials = (letter || defaultInitials).slice(0, 2).toUpperCase() || '?';

  const useMonogram = !!bg;
  const hash    = trimmed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const [lo, hi] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  const background = useMonogram
    ? bg!
    : `linear-gradient(135deg, ${lo} 0%, ${hi} 100%)`;
  const color = useMonogram ? avatarFg(bg!) : '#ffffff';
  const fontDef = AVATAR_FONTS[font ?? 0] || AVATAR_FONTS[0];

  // When a ring is shown the inner disc is inset by 3px (1.5px ring + 1.5px gap).
  const innerSize = ring ? size - 6 : size;

  const disc = (
    <div
      className="flex items-center justify-center shrink-0 select-none"
      style={{
        width: innerSize,
        height: innerSize,
        // Slightly larger font relative to size so the letter fills the circle,
        // and a text-shadow for the "stamped coin" premium feel.
        fontSize: innerSize * (initials.length === 1 ? 0.54 : 0.46),
        fontWeight: fontDef.weight,
        fontFamily: fontDef.family,
        letterSpacing: '0.01em',
        background,
        color,
        borderRadius: '50%',
        boxShadow: useMonogram
          ? '0 2px 6px rgba(15,23,42,0.15)'
          : 'inset 0 1.5px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(15,23,42,0.15)',
        lineHeight: 1,
        textShadow: '0 1px 2px rgba(0,0,0,0.18)',
      }}
      title={trimmed || ''}
      aria-label={trimmed || 'User'}
    >
      {initials}
    </div>
  );

  if (!ring) return disc;

  // Gradient ring wrapper — same technique as Instagram stories: a gradient
  // background with a small transparent gap between it and the inner disc.
  return (
    <div
      className="shrink-0 flex items-center justify-center select-none"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #1565C0 0%, #1976D2 40%, #2B8C29 100%)',
        padding: 2,
      }}
      title={trimmed || ''}
      aria-label={trimmed || 'User'}
    >
      <div style={{ borderRadius: '50%', padding: 1.5, background: 'var(--bg-card, #fff)' }}>
        {disc}
      </div>
    </div>
  );
}

// ── Status option sets ────────────────────────────────────────────────────────
export const TASK_STATUS_OPTIONS    = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;
export const PROJECT_STATUS_OPTIONS = ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const;

// ── StatusSelect — custom pill dropdown replacing native <select> ─────────────
export function StatusSelect({
  value,
  onChange,
  options = TASK_STATUS_OPTIONS as unknown as string[],
  size = 'md',
  pending = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: readonly string[] | string[];
  size?: 'sm' | 'md';
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const dot   = STATUS_DOT[value]   ?? '#94a3b8';
  const label = STATUS_LABEL[value] ?? value.replace(/_/g, ' ');

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !pending && setOpen(o => !o)}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border bg-white dark:bg-white/5 transition-all font-semibold text-slate-700 dark:text-white/80 disabled:opacity-70 ${
          open
            ? 'border-blue-300 ring-2 ring-blue-100 dark:border-blue-600 dark:ring-blue-900'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/8'
        } ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1.5 text-xs'}`}
      >
        {pending ? (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60 shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
        )}
        {label}
        {!pending && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none"
            className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-[#2a2a28] rounded-xl border border-slate-100 dark:border-white/10 overflow-hidden"
          style={{ minWidth: 148, boxShadow: '0 4px 20px rgba(15,23,42,0.12), 0 1px 4px rgba(15,23,42,0.06)' }}
        >
          {(options as string[]).map(opt => {
            const optDot   = STATUS_DOT[opt]   ?? '#94a3b8';
            const optLabel = STATUS_LABEL[opt] ?? opt.replace(/_/g, ' ');
            const active   = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                  active ? 'bg-slate-50 text-slate-900 dark:bg-white/8 dark:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-white/60 dark:hover:bg-white/6 dark:hover:text-white/85'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: optDot }} />
                {optLabel}
                {active && <span className="ml-auto text-blue-600 text-[10px] font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── StatusPillRow ───────────────────────────────────────────────────────────
// Inline pill-row replacement for the StatusSelect dropdown. Used on
// detail pages (task / project) where there's room to show every status
// at once; the click target is the pill itself, so changing status is one
// tap instead of two (open dropdown + pick). Mirrors Kite's direct-action
// philosophy — no extra modal, no extra confirmation step.
export function StatusPillRow({
  value,
  onChange,
  options = TASK_STATUS_OPTIONS as unknown as string[],
  pending = false,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options?: readonly string[] | string[];
  pending?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1 dark:border-white/10 dark:bg-white/5 ${className}`}>
      {(options as string[]).map((opt) => {
        const active   = opt === value;
        const optDot   = STATUS_DOT[opt]   ?? '#94a3b8';
        const optLabel = STATUS_LABEL[opt] ?? opt.replace(/_/g, ' ');
        return (
          <button
            key={opt}
            type="button"
            disabled={pending}
            onClick={() => !active && onChange(opt)}
            aria-pressed={active}
            className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              active
                ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_0_0_1px_rgba(21,101,192,0.18)] dark:bg-white/12 dark:text-white dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60 dark:text-white/45 dark:hover:text-white/75 dark:hover:bg-white/8'
            } disabled:opacity-50`}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: optDot }} />
            {optLabel}
          </button>
        );
      })}
      {pending && (
        <span className="ml-1 w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60 text-slate-400" />
      )}
    </div>
  );
}

// ── useToast — simple ephemeral notification ──────────────────────────────────
export function useToast() {
  const [toast, setToastState] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastState({ msg, kind });
    timerRef.current = setTimeout(() => setToastState(null), 3000);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const ToastEl = toast ? (
    <div
      role="status"
      className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border text-sm font-semibold fade-in-soft`}
      style={{
        background: toast.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
        borderColor: toast.kind === 'ok' ? '#bbf7d0' : '#fecaca',
        color: toast.kind === 'ok' ? '#15803d' : '#dc2626',
      }}
    >
      {toast.kind === 'ok'
        ? <span className="text-green-500">✓</span>
        : <span className="text-red-500">!</span>}
      {toast.msg}
    </div>
  ) : null;

  return { showToast, ToastEl };
}

// ── Links ─────────────────────────────────────────────────────────────────────
export function TaskLink({ task, children, className }: { task: { id: string; title?: string }; children?: ReactNode; className?: string }) {
  return (
    <Link href={`/tasks/${task.id}`} className={className ?? 'font-medium text-slate-800 hover:text-blue-700 transition-colors'}>
      {children || task.title}
    </Link>
  );
}

export function ProjectLink({ project, children }: { project: { id: string; name?: string }; children?: ReactNode }) {
  return (
    <Link href={`/projects/${project.id}`} className="font-medium text-slate-700 hover:text-brand-700 transition-colors">
      {children || project.name}
    </Link>
  );
}
