'use client'
import { useEffect, useRef, useState } from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import { scoreAlcoa, type AlcoaScore, type AlcoaPrinciple, type TaskSnapshot } from '@/lib/alcoa'

const PRINCIPLE_ORDER: AlcoaPrinciple[] = [
  'attributable', 'legible', 'contemporaneous', 'original', 'accurate',
  'complete', 'consistent', 'enduring', 'available',
]

const PRINCIPLE_ABBR: Record<AlcoaPrinciple, string> = {
  attributable:    'A',
  legible:         'L',
  contemporaneous: 'C',
  original:        'O',
  accurate:        'A²',
  complete:        '+C',
  consistent:      '+Co',
  enduring:        '+E',
  available:       '+Av',
}

function gradeColor(total: number) {
  if (total >= 80) return { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: '#10b981' }
  if (total >= 60) return { chip: 'bg-amber-50 text-amber-800 border-amber-200',    bar: '#f59e0b' }
  if (total >= 40) return { chip: 'bg-orange-50 text-orange-800 border-orange-200', bar: '#f97316' }
  return               { chip: 'bg-red-50 text-red-700 border-red-200',             bar: '#ef4444' }
}

function principleBarColor(pct: number) {
  if (pct >= 0.8) return '#10b981'
  if (pct >= 0.6) return '#f59e0b'
  if (pct >= 0.4) return '#f97316'
  return '#ef4444'
}

export function AlcoaBadge({ task }: { task: TaskSnapshot }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const score: AlcoaScore = scoreAlcoa(task)
  const colors = gradeColor(score.total)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Personal tasks aren't GxP records — never clutter them with a compliance score.
  if (task.projectIsPersonal) return null

  return (
    <div ref={ref} className="relative inline-block">
      {/* Resting state is deliberately quiet — a muted shield + grade letter that
          blends in and is easy to ignore. The full score, colours and per-principle
          breakdown only appear on click, so the badge never competes for attention. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-100/70 dark:text-white/35 dark:hover:text-white/60 dark:hover:bg-white/8 transition-colors cursor-pointer select-none"
        title={`ALCOA+ data integrity ${score.total}/100 · grade ${score.grade} — click for breakdown`}
        aria-label={`ALCOA+ data integrity score ${score.total} out of 100, grade ${score.grade}`}
      >
        <ShieldCheck size={12} />
        <span className="tabular-nums">{score.grade}</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-80 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e1e1c] shadow-lg"
          style={{ boxShadow: '0 4px 16px rgba(15,23,42,0.10)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/8 bg-slate-50/70 dark:bg-white/5 rounded-t-xl">
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-slate-500 dark:text-white/40" />
              <span className="text-xs font-bold text-slate-700 dark:text-white/70 uppercase tracking-wide">ALCOA⁺ Score</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-bold"
                style={{ color: colors.bar }}
              >
                {score.total}/100
              </span>
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded"
                style={{ background: colors.bar + '18', color: colors.bar }}
              >
                {score.grade}
              </span>
            </div>
          </div>

          {/* Principle bars */}
          <div className="px-4 py-3 space-y-2.5">
            {PRINCIPLE_ORDER.map(key => {
              const p = score.principles[key]
              const pct = p.max > 0 ? p.score / p.max : 0
              const barColor = principleBarColor(pct)
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-slate-400 dark:text-white/35 w-6 shrink-0">{PRINCIPLE_ABBR[key]}</span>
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-white/70">{p.label}</span>
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: barColor }}>
                      {p.score}/{p.max}
                    </span>
                  </div>
                  {/* Bar */}
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.round(pct * 100)}%`, background: barColor }}
                    />
                  </div>
                  {/* Gap signals */}
                  {p.signals.filter(s => !s.pass && !s.na).map((s, i) => (
                    <p key={i} className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 ml-7 leading-tight">
                      ✕ {s.label}
                    </p>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 dark:border-white/8 rounded-b-xl bg-slate-50/50 dark:bg-white/5">
            <p className="text-[9px] text-slate-400 dark:text-white/30 leading-tight">
              Based on 21 CFR Part 11 / ALCOA+ data-integrity principles. Score is deterministic and locally traceable.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
