import { Link } from 'react-router-dom';

export const STATUS_COLORS = {
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

export const PRIORITY_COLORS = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700'
};

export const LIFECYCLE_LABELS = {
  csv: 'CSV',
  sop: 'SOP',
  deviation_capa: 'Deviation/CAPA',
  change_control: 'Change Control',
  audit: 'Audit',
  validation: 'Validation',
  generic: 'Generic'
};

export const LIFECYCLE_COLORS = {
  csv: 'bg-indigo-100 text-indigo-700',
  sop: 'bg-emerald-100 text-emerald-700',
  deviation_capa: 'bg-red-100 text-red-700',
  change_control: 'bg-amber-100 text-amber-800',
  audit: 'bg-purple-100 text-purple-700',
  validation: 'bg-sky-100 text-sky-700',
  generic: 'bg-slate-100 text-slate-700'
};

export function Tag({ children, className = '' }) {
  return <span className={`tag ${className}`}>{children}</span>;
}

export function StatusTag({ status }) {
  return <Tag className={STATUS_COLORS[status] || 'bg-slate-100 text-slate-700'}>{status?.replace('_', ' ')}</Tag>;
}

export function PriorityTag({ priority }) {
  return <Tag className={PRIORITY_COLORS[priority] || 'bg-slate-100'}>{priority}</Tag>;
}

export function LifecycleTag({ lifecycle }) {
  return (
    <Tag className={LIFECYCLE_COLORS[lifecycle] || 'bg-slate-100'}>
      {LIFECYCLE_LABELS[lifecycle] || lifecycle}
    </Tag>
  );
}

export function ProgressBar({ value, className = '' }) {
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

export function Card({ title, action, children, className = '' }) {
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

export function EmptyState({ title, hint }) {
  return (
    <div className="text-center py-10 text-slate-500">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs mt-1">{hint}</div>}
    </div>
  );
}

export function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function daysUntil(s) {
  if (!s) return null;
  const d = new Date(s);
  const now = new Date();
  const diff = Math.round((d - now) / 86400000);
  return diff;
}

export function Avatar({ name, size = 28 }) {
  const initials = (name || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return (
    <div
      className="rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center"
      style={style}
      title={name}
    >
      {initials}
    </div>
  );
}

export function TaskLink({ task, children }) {
  return (
    <Link to={`/tasks/${task.id}`} className="text-brand-700 hover:underline">
      {children || task.title}
    </Link>
  );
}

export function ProjectLink({ project, children }) {
  return (
    <Link to={`/projects/${project.id}`} className="text-brand-700 hover:underline font-medium">
      {children || project.name}
    </Link>
  );
}
