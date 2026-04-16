'use client';
import Link from 'next/link';
import { ReactNode } from 'react';

export const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-700',
  done: 'bg-emerald-100 text-emerald-700',
  planning: 'bg-slate-100 text-slate-700',
  on_hold: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700'
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700'
};

export const LIFECYCLE_LABELS: Record<string, string> = {
  csv: 'CSV',
  sop: 'SOP',
  deviation_capa: 'Deviation/CAPA',
  change_control: 'Change Control',
  audit: 'Audit',
  validation: 'Validation',
  data_integrity: 'Data Integrity',
  pharmacovigilance: 'PV',
  generic: 'Generic'
};

export const LIFECYCLE_COLORS: Record<string, string> = {
  csv: 'bg-indigo-100 text-indigo-700',
  sop: 'bg-emerald-100 text-emerald-700',
  deviation_capa: 'bg-red-100 text-red-700',
  change_control: 'bg-amber-100 text-amber-800',
  audit: 'bg-purple-100 text-purple-700',
  validation: 'bg-sky-100 text-sky-700',
  data_integrity: 'bg-teal-100 text-teal-700',
  pharmacovigilance: 'bg-pink-100 text-pink-700',
  generic: 'bg-slate-100 text-slate-700'
};

export const SEVERITY_COLORS: Record<string, string> = {
  minor: 'bg-slate-100 text-slate-700 border border-slate-300',
  major: 'bg-amber-100 text-amber-800 border border-amber-300',
  critical: 'bg-red-100 text-red-700 border border-red-300'
};

export const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
  medium: 'bg-amber-100 text-amber-800 border border-amber-300',
  high: 'bg-red-100 text-red-700 border border-red-300'
};

export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`tag ${className}`}>{children}</span>;
}

export function StatusTag({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <Tag className={STATUS_COLORS[status] || 'bg-slate-100'}>
      {status.replace('_', ' ')}
    </Tag>
  );
}

export function PriorityTag({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return <Tag className={PRIORITY_COLORS[priority] || 'bg-slate-100'}>{priority}</Tag>;
}

export function LifecycleTag({ lifecycle }: { lifecycle?: string | null }) {
  if (!lifecycle) return null;
  return (
    <Tag className={LIFECYCLE_COLORS[lifecycle] || 'bg-slate-100'}>
      {LIFECYCLE_LABELS[lifecycle] || lifecycle}
    </Tag>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`w-full bg-slate-200 rounded-full h-2 ${className}`}>
      <div
        className="bg-brand-500 h-2 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = ''
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
          {title && <h3 className="font-semibold text-slate-800">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-10 text-slate-500">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs mt-1">{hint}</div>}
    </div>
  );
}

export function formatDate(s?: string | Date | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function daysUntil(s?: string | Date | null) {
  if (!s) return null;
  const d = new Date(s);
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  return diff;
}

export function Avatar({ name, size = 28 }: { name?: string | null; size?: number }) {
  const initials = (name || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={name || ''}
    >
      {initials}
    </div>
  );
}

export function TaskLink({
  task,
  children
}: {
  task: { id: string; title?: string };
  children?: ReactNode;
}) {
  return (
    <Link href={`/tasks/${task.id}`} className="text-brand-700 hover:underline">
      {children || task.title}
    </Link>
  );
}

export function ProjectLink({
  project,
  children
}: {
  project: { id: string; name?: string };
  children?: ReactNode;
}) {
  return (
    <Link href={`/projects/${project.id}`} className="text-brand-700 hover:underline font-medium">
      {children || project.name}
    </Link>
  );
}
