'use client';
import Link from 'next/link';
import { ReactNode } from 'react';

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
  todo:        'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  review:      'bg-amber-50 text-amber-700',
  blocked:     'bg-red-50 text-red-600',
  done:        'bg-green-50 text-green-700',
  planning:    'bg-slate-100 text-slate-600',
  on_hold:     'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
  cancelled:   'bg-red-50 text-red-600',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low:      'bg-slate-100 text-slate-500',
  medium:   'bg-sky-50 text-sky-700',
  high:     'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
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
  // Life Sciences templates (kept for compatibility)
  csv:               'CSV',
  sop:               'SOP',
  deviation_capa:    'Issue/CAPA',
  change_control:    'Change Control',
  audit:             'Audit',
  validation:        'Validation',
  data_integrity:    'Data Integrity',
  pharmacovigilance: 'Safety Reporting',
  generic:           'Generic',
};

export const LIFECYCLE_COLORS: Record<string, string> = {
  // Generic templates
  agile_sprint:      'text-violet-700 bg-violet-50',
  software_release:  'text-sky-700 bg-sky-50',
  product_launch:    'text-orange-700 bg-orange-50',
  research:          'text-teal-700 bg-teal-50',
  // Life Sciences templates
  csv:               'text-indigo-700 bg-indigo-50',
  sop:               'text-emerald-700 bg-emerald-50',
  deviation_capa:    'text-red-600 bg-red-50',
  change_control:    'text-amber-700 bg-amber-50',
  audit:             'text-purple-700 bg-purple-50',
  validation:        'text-sky-700 bg-sky-50',
  data_integrity:    'text-teal-700 bg-teal-50',
  pharmacovigilance: 'text-pink-700 bg-pink-50',
  generic:           'text-slate-600 bg-slate-100',
};

export const SEVERITY_COLORS: Record<string, string> = {
  minor:    'bg-slate-100 text-slate-700',
  major:    'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-700',
};

export const RISK_COLORS: Record<string, string> = {
  low:    'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-800',
  high:   'bg-red-50 text-red-700',
};

// ── Tag primitives ────────────────────────────────────────────────────────────
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function StatusTag({ status }: { status?: string | null }) {
  if (!status) return null;
  const dot = STATUS_DOT[status] ?? '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
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
    <div className={`w-full bg-slate-100 rounded-full h-1 ${className}`}>
      <div
        className="progress-bar-fill h-1 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
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
  return Math.round((new Date(s).getTime() - Date.now()) / 86400000);
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  '#1565C0','#0D47A1','#1976D2','#388E3C','#2E7D32',
  '#6D4C41','#4527A0','#00695C','#C62828','#558B2F',
];

export function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
  const initials = (name || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const bg = AVATAR_PALETTE[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length];
  return (
    <div
      className="rounded-md font-bold flex items-center justify-center text-white shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}
      title={name || ''}
    >
      {initials}
    </div>
  );
}

// ── Links ─────────────────────────────────────────────────────────────────────
export function TaskLink({ task, children }: { task: { id: string; title?: string }; children?: ReactNode }) {
  return (
    <Link href={`/tasks/${task.id}`} className="font-medium text-slate-800 hover:text-brand-700 transition-colors">
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
