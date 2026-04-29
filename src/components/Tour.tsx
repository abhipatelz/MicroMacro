'use client';
import { useEffect, useState, useCallback } from 'react';
import { X, ArrowRight } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Step {
  target?: string;        // data-tour="..." on DOM element; omit for centred intro card
  title: string;
  body: string;
  emoji: string;
  accent: string;
  placement?: 'right' | 'left' | 'bottom' | 'top';
}

interface TargetRect { x: number; y: number; w: number; h: number }

/* ── Step definitions ─────────────────────────────────────────────────────── */
const EMPLOYEE_STEPS: Step[] = [
  {
    emoji: '👋',
    title: 'Welcome to Pragati!',
    body: "You're in. Let's take a 30-second tour of what's here for you.",
    accent: '#1565C0',
  },
  {
    target: 'nav-tasks',
    emoji: '✅',
    title: 'My Tasks',
    body: 'Your personal task board. See everything assigned to you — overdue, due today, this week, and later. Mark tasks done with one click.',
    accent: '#1565C0',
    placement: 'right',
  },
  {
    target: 'nav-projects',
    emoji: '📁',
    title: 'Projects',
    body: 'Browse all projects you\'re part of. Each project has phases, a Kanban board, and a full task list. Your PM assigns tasks to you from here.',
    accent: '#0369a1',
    placement: 'right',
  },
  {
    target: 'cmd-palette',
    emoji: '⌘',
    title: 'Search & jump',
    body: 'Press ⌘K (or Ctrl+K) anywhere to instantly jump to any project or person. Fastest way to navigate — no clicking needed.',
    accent: '#7c3aed',
    placement: 'right',
  },
  {
    target: 'notifications',
    emoji: '🔔',
    title: 'Notifications',
    body: 'Overdue tasks and upcoming deadlines show here. The badge turns red when something needs your attention.',
    accent: '#f59e0b',
    placement: 'right',
  },
  {
    target: 'user-profile',
    emoji: '⚙️',
    title: 'Your profile',
    body: 'Hover here to access settings, change your password, toggle dark mode, or sign out.',
    accent: '#475569',
    placement: 'right',
  },
];

const PM_STEPS: Step[] = [
  {
    emoji: '🎯',
    title: 'Welcome, PM!',
    body: "You have full visibility across the org. Let's walk through your power tools.",
    accent: '#1565C0',
  },
  {
    target: 'nav-home',
    emoji: '📊',
    title: 'Your dashboard',
    body: 'At-a-glance org health: active projects, overdue tasks, completion rate, and items needing your attention right now.',
    accent: '#1565C0',
    placement: 'right',
  },
  {
    target: 'nav-projects',
    emoji: '🗂️',
    title: 'Projects',
    body: 'Create projects with predefined workflow templates (Agile, SOP, Validation…) or build your own custom stages. Tasks are seeded automatically.',
    accent: '#0369a1',
    placement: 'right',
  },
  {
    target: 'nav-people',
    emoji: '👥',
    title: 'People',
    body: 'Invite team members here. They get a temp password and are prompted to set their own on first login.',
    accent: '#7c3aed',
    placement: 'right',
  },
  {
    target: 'nav-org',
    emoji: '🏛️',
    title: 'Command Centre',
    body: 'Org-wide analytics: project health, overdue breakdown, team workload, and completion trends. Your operations hub.',
    accent: '#dc2626',
    placement: 'right',
  },
  {
    target: 'nav-insights',
    emoji: '✨',
    title: 'AI Insights',
    body: 'AI-powered risk triage and issue classification — automatically surfaces blockers before they become crises.',
    accent: '#d97706',
    placement: 'right',
  },
  {
    target: 'cmd-palette',
    emoji: '⌘',
    title: 'Command palette',
    body: 'Press ⌘K to search across all projects and people instantly. Essential once your project list grows.',
    accent: '#0f766e',
    placement: 'right',
  },
];

/* ── Storage keys ─────────────────────────────────────────────────────────── */
const KEY_EMP = 'pragati_tour2_employee';
const KEY_PM  = 'pragati_tour2_pm';

/* ── Geometry helpers ─────────────────────────────────────────────────────── */
const PAD = 10;
const TW  = 300;   // tooltip width
const TG  = 18;    // gap between element and tooltip

function getTargetRect(id: string): TargetRect | null {
  const el = document.querySelector(`[data-tour="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function tooltipStyle(rect: TargetRect, placement?: string): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const prefer = placement ?? 'right';

  if (prefer === 'right' && rect.x + rect.w + TG + TW <= vw) {
    const top = Math.max(PAD, Math.min(rect.y + rect.h / 2 - 90, vh - 240 - PAD));
    return { position: 'fixed', left: rect.x + rect.w + TG, top, width: TW };
  }
  if (prefer === 'left' && rect.x - TG - TW >= 0) {
    const top = Math.max(PAD, Math.min(rect.y + rect.h / 2 - 90, vh - 240 - PAD));
    return { position: 'fixed', left: rect.x - TG - TW, top, width: TW };
  }
  // Bottom fallback
  const left = Math.max(PAD, Math.min(rect.x + rect.w / 2 - TW / 2, vw - TW - PAD));
  const top  = Math.min(rect.y + rect.h + TG, vh - 240 - PAD);
  return { position: 'fixed', left, top, width: TW };
}

function arrowDir(rect: TargetRect, placement?: string): 'left' | 'right' | 'top' | null {
  const vw = window.innerWidth;
  const prefer = placement ?? 'right';
  if (prefer === 'right' && rect.x + rect.w + TG + TW <= vw) return 'left';
  if (prefer === 'left'  && rect.x - TG - TW >= 0)            return 'right';
  return 'top';
}

/* ── Arrow CSS ────────────────────────────────────────────────────────────── */
function Arrow({ dir, accent }: { dir: 'left' | 'right' | 'top' | null; accent: string }) {
  if (!dir) return null;
  const base: React.CSSProperties = { position: 'absolute', width: 0, height: 0 };
  if (dir === 'left')  return <div style={{ ...base, left: -10, top: '50%', transform: 'translateY(-50%)', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderRight: `10px solid ${accent}` }} />;
  if (dir === 'right') return <div style={{ ...base, right: -10, top: '50%', transform: 'translateY(-50%)', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: `10px solid ${accent}` }} />;
  return <div style={{ ...base, top: -10, left: '50%', transform: 'translateX(-50%)', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: `10px solid ${accent}` }} />;
}

/* ════════════════════════════════════════════════════════════════════════════
   TOUR COMPONENT
════════════════════════════════════════════════════════════════════════════ */
export function Tour({ role }: { role: 'employee' | 'pm' }) {
  const steps     = role === 'pm' ? PM_STEPS : EMPLOYEE_STEPS;
  const storageKey = role === 'pm' ? KEY_PM : KEY_EMP;

  const [active, setActive]   = useState(false);
  const [step, setStep]       = useState(0);
  const [rect, setRect]       = useState<TargetRect | null>(null);
  const [tooltipPos, setTPos] = useState<React.CSSProperties>({});
  const [arrow, setArrow]     = useState<'left' | 'right' | 'top' | null>(null);

  const current = steps[step];

  /* Update geometry whenever step changes or window resizes */
  const recalc = useCallback(() => {
    if (!active || !current.target) { setRect(null); return; }
    const r = getTargetRect(current.target);
    setRect(r);
    if (r) {
      setTPos(tooltipStyle(r, current.placement));
      setArrow(arrowDir(r, current.placement));
    }
  }, [active, current]);

  useEffect(() => {
    // Show tour unless user has explicitly completed it (skip keeps showing until done)
    try { if (localStorage.getItem(storageKey) !== 'done') setActive(true); } catch {}
  }, [storageKey]);

  useEffect(() => {
    recalc();
    const t = setTimeout(recalc, 80);
    window.addEventListener('resize', recalc);
    return () => { clearTimeout(t); window.removeEventListener('resize', recalc); };
  }, [recalc]);

  function complete() {
    try { localStorage.setItem(storageKey, 'done'); } catch {}
    setActive(false);
  }

  function skip() {
    // Hide for this session but show again next login until completed
    setActive(false);
  }

  function next() {
    if (step < steps.length - 1) setStep(s => s + 1);
    else complete();
  }

  function prev() { if (step > 0) setStep(s => s - 1); }

  if (!active) return null;

  const isCentered = !current.target;

  return (
    <>
      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${current.accent}60, 0 0 0 9999px rgba(0,0,0,0.55); }
          50%       { box-shadow: 0 0 0 6px ${current.accent}40, 0 0 0 9999px rgba(0,0,0,0.55); }
        }
        @keyframes tour-fade-in {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes tour-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        [data-tour-active] {
          position: relative;
          z-index: 10000;
          border-radius: 10px;
          animation: tour-pulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* ── SVG Spotlight overlay ──────────────────────────────────────── */}
      {!isCentered && rect && (
        <svg
          style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9991, pointerEvents: 'none', animation: 'tour-overlay-in 0.3s ease' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id="tour-spotlight">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.x - PAD} y={rect.y - PAD}
                width={rect.w + PAD * 2} height={rect.h + PAD * 2}
                rx="10" fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.58)" mask="url(#tour-spotlight)" />
          {/* Spotlight ring */}
          <rect
            x={rect.x - PAD} y={rect.y - PAD}
            width={rect.w + PAD * 2} height={rect.h + PAD * 2}
            rx="10" fill="none"
            stroke={current.accent} strokeWidth="2" strokeOpacity="0.8"
            style={{ filter: `drop-shadow(0 0 6px ${current.accent}90)` }}
          />
        </svg>
      )}

      {/* ── Dark overlay for centred step ─────────────────────────────── */}
      {isCentered && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9991, background: 'rgba(0,0,0,0.55)', animation: 'tour-overlay-in 0.3s ease' }}
          onClick={skip}
        />
      )}

      {/* ── Tooltip / card ────────────────────────────────────────────── */}
      <div
        style={{
          zIndex: 10001,
          animation: 'tour-fade-in 0.25s ease',
          ...(isCentered
            ? { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 340 }
            : tooltipPos),
        }}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ border: `2px solid ${current.accent}`, background: '#fff' }}
        >
          {/* Arrow */}
          {!isCentered && <Arrow dir={arrow} accent={current.accent} />}

          {/* Accent top bar */}
          <div style={{ height: 4, background: `linear-gradient(90deg, ${current.accent}, ${current.accent}88)` }} />

          {/* Content */}
          <div className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-2xl leading-none shrink-0 mt-0.5">{current.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: current.accent }}>
                  {role === 'pm' ? 'PM Tour' : 'Getting started'} · {step + 1}/{steps.length}
                </div>
                <h3 className="text-base font-black text-slate-900 tracking-tight leading-tight">{current.title}</h3>
              </div>
              <button onClick={skip} className="p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors shrink-0 -mt-1 -mr-1">
                <X size={14} />
              </button>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">{current.body}</p>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5 mt-4 mb-3">
              {steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === step ? 18 : 5, height: 5,
                    background: i === step ? current.accent : i < step ? current.accent + '55' : '#e2e8f0',
                  }} />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button onClick={skip} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button onClick={prev}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors">
                    ← Back
                  </button>
                )}
                <button onClick={next}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
                  style={{ background: current.accent }}>
                  {step < steps.length - 1 ? <><span>Next</span><ArrowRight size={12} /></> : <span>Done 🎉</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function resetTour(role: 'employee' | 'pm') {
  try { localStorage.removeItem(role === 'pm' ? KEY_PM : KEY_EMP); } catch {}
}

export function completeTour(role: 'employee' | 'pm') {
  try { localStorage.setItem(role === 'pm' ? KEY_PM : KEY_EMP, 'done'); } catch {}
}
