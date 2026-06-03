'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Sheet, FileCode2, ChevronDown, FileSpreadsheet } from 'lucide-react';

/**
 * A single "Export" button that opens a small menu of formats (PDF, CSV, HTML).
 * Replaces the row of three separate download buttons we used to show on the
 * team & project pages, so the action reads as one decision ("export") with a
 * format choice — cleaner and consistent everywhere.
 *
 * Each handler is supplied by the caller, so this component stays presentation
 * only and the actual report generation lives next to the data.
 */
export function ExportMenu({
  onExcel, onPdf, onCsv, onHtml, label = 'Export', disabled = false,
}: {
  /** Optional rich, interactive .xlsx (tables, dropdowns, live formulas). */
  onExcel?: () => void;
  onPdf: () => void;
  onCsv: () => void;
  onHtml: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const items = [
    ...(onExcel ? [{ key: 'xlsx', label: 'Excel (interactive)', hint: 'Editable — dropdowns, filters, live totals', icon: FileSpreadsheet, onClick: onExcel, tint: '#15803d' }] : []),
    { key: 'pdf',  label: 'PDF',  hint: 'Print-ready, for meetings', icon: FileText,  onClick: onPdf,  tint: '#dc2626' },
    { key: 'csv',  label: 'CSV',  hint: 'Flat data — pivot & filter', icon: Sheet,     onClick: onCsv,  tint: '#16a34a' },
    { key: 'html', label: 'HTML', hint: 'Self-contained web page',  icon: FileCode2, onClick: onHtml, tint: '#2563eb' },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 transition-colors disabled:opacity-50"
        title="Export this report"
      >
        <Download size={15} /> {label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-60 rounded-xl border border-slate-200/80 bg-white dark:bg-[#262624] dark:border-white/10 shadow-xl z-30 overflow-hidden p-1 modal-in"
          style={{ boxShadow: '0 18px 44px rgba(15,23,42,0.16)' }}
        >
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Download as</div>
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => { setOpen(false); it.onClick(); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${it.tint}1a` }}>
                  <Icon size={15} style={{ color: it.tint }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-white/90">{it.label}</span>
                  <span className="block text-[11px] text-slate-400">{it.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
