'use client';
import { useEffect, useState, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';

interface Step {
  target?: string;
  title: string;
  body: string;
  emoji: string;
  accent: string;
  tag?: string;
  placement?: 'right' | 'left' | 'bottom' | 'top';
}

interface TargetRect { x: number; y: number; w: number; h: number }

/* ── IC steps — written for someone who's never used a pharma PM tool ─── */
const EMPLOYEE_STEPS: Step[] = [
  {
    emoji: '🧪',
    title: 'Welcome to Pragati',
    tag: 'Onboarding · Step 1',
    body: "Think of this as your GxP-compliant task manager — but one you'll actually enjoy using. No 50-page SOP required to get started.",
    accent: '#1565C0',
  },
  {
    target: 'nav-tasks',
    emoji: '✅',
    title: 'My Tasks',
    tag: 'Your workspace',
    body: "Everything assigned to you — sorted by urgency. Overdue shows in red, due today in amber. One click to mark done and close the loop.",
    accent: '#1565C0',
    placement: 'right',
  },
  {
    target: 'nav-projects',
    emoji: '📋',
    title: 'Projects',
    tag: 'Controlled workflows',
    body: "Each project runs a defined lifecycle — Deviation, CAPA, Change Control, CSV Validation. Phases and tasks are pre-built. You just work through them.",
    accent: '#0369a1',
    placement: 'right',
  },
  {
    target: 'nav-copilot',
    emoji: '🤖',
    title: 'QA Copilot',
    tag: 'AI · Free',
    body: "Confused by a QA procedure? Describe the situation — get plain-English steps instantly. No more 'what form do I fill?' moments. Add any step to your tasks in one click.",
    accent: '#7c3aed',
    placement: 'right',
  },
  {
    target: 'nav-yearly',
    emoji: '📅',
    title: 'My Year',
    tag: 'Your audit trail',
    body: "A 12-month view of everything you've worked on. QI auditors love traceability — this is yours.",
    accent: '#0891b2',
    placement: 'right',
  },
  {
    target: 'notifications',
    emoji: '🔔',
    title: 'Alerts',
    tag: 'Stay on schedule',
    body: "Overdue tasks and upcoming deadlines surface here. Red badge = something needs your attention. Less painful than a real deviation finding.",
    accent: '#f59e0b',
    placement: 'right',
  },
  {
    target: 'user-profile',
    emoji: '⚙️',
    title: 'You\'re all set',
    tag: 'Final step',
    body: "Profile, password, dark mode — all here. You've completed the tour. QA Copilot is your first stop whenever you hit a compliance question.",
    accent: '#16a34a',
    placement: 'right',
  },
];

/* ── PM steps — for the person responsible for the whole quality system ─ */
const PM_STEPS: Step[] = [
  {
    emoji: '🏭',
    title: 'Your Quality Ops Centre',
    tag: 'PM Onboarding · Step 1',
    body: "Pragati gives you visibility across every project, person, and quality event in the org. Let's walk through what's built for you specifically.",
    accent: '#1565C0',
  },
  {
    target: 'nav-home',
    emoji: '📊',
    title: 'PM Dashboard',
    tag: 'Org-wide pulse',
    body: "Active projects, open tasks, overdue count, tasks shipped this month — plus a project health status right in the header. Your morning stand-up, automated.",
    accent: '#1565C0',
    placement: 'right',
  },
  {
    target: 'nav-projects',
    emoji: '🗂️',
    title: 'Projects',
    tag: 'QI lifecycles',
    body: "QI-specific templates: Deviation, CAPA, Change Control, Software Change (GAMP 5), CSV Validation, Pharmacovigilance. Phases and starter tasks are seeded automatically.",
    accent: '#0369a1',
    placement: 'right',
  },
  {
    target: 'nav-org',
    emoji: '🛰️',
    title: 'Operations Hub',
    tag: 'Bird\'s eye view',
    body: "Org-wide: every project's health, every person's workload, every blocker. The view you'd want before a steering committee meeting.",
    accent: '#dc2626',
    placement: 'right',
  },
  {
    target: 'nav-risk',
    emoji: '📡',
    title: 'Task Triage',
    tag: 'AI · Deadline prediction',
    body: "Every open task is scored for deadline-miss probability using a model trained on your team's own history. Spot the fires before they start and fix them inline.",
    accent: '#b45309',
    placement: 'right',
  },
  {
    target: 'nav-insights',
    emoji: '✨',
    title: 'Insights',
    tag: 'Team intelligence',
    body: "Project health radar, team velocity chart, overloaded people, stuck tasks. A morning brief is auto-generated from live data — no report writing needed.",
    accent: '#d97706',
    placement: 'right',
  },
  {
    target: 'nav-copilot',
    emoji: '🤖',
    title: 'QA Copilot',
    tag: 'AI · Free',
    body: "Your whole team can ask QA procedure questions here. IT engineers, new joiners, adjacent teams — anyone confused about deviations or change control gets instant guidance.",
    accent: '#7c3aed',
    placement: 'right',
  },
  {
    target: 'nav-people',
    emoji: '👥',
    title: 'People',
    tag: 'Access control',
    body: "Invite members — they get a temp password and must set their own on first login. Self-registration is disabled. Only you can promote to PM.",
    accent: '#0f766e',
    placement: 'right',
  },
];

const KEY_EMP = 'pragati_tour3_employee';
const KEY_PM  = 'pragati_tour3_pm';
const PAD = 12;
const TW  = 320;
const TG  = 20;

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
    const top = Math.max(PAD, Math.min(rect.y + rect.h / 2 - 110, vh - 280 - PAD));
    return { position: 'fixed', left: rect.x + rect.w + TG, top, width: TW };
  }
  if (prefer === 'left' && rect.x - TG - TW >= 0) {
    const top = Math.max(PAD, Math.min(rect.y + rect.h / 2 - 110, vh - 280 - PAD));
    return { position: 'fixed', left: rect.x - TG - TW, top, width: TW };
  }
  const left = Math.max(PAD, Math.min(rect.x + rect.w / 2 - TW / 2, vw - TW - PAD));
  const top  = Math.min(rect.y + rect.h + TG, vh - 280 - PAD);
  return { position: 'fixed', left, top, width: TW };
}

function arrowDir(rect: TargetRect, placement?: string): 'left' | 'right' | 'top' | null {
  const vw = window.innerWidth;
  const prefer = placement ?? 'right';
  if (prefer === 'right' && rect.x + rect.w + TG + TW <= vw) return 'left';
  if (prefer === 'left'  && rect.x - TG - TW >= 0)            return 'right';
  return 'top';
}

function Arrow({ dir, accent }: { dir: 'left' | 'right' | 'top' | null; accent: string }) {
  if (!dir) return null;
  const base: React.CSSProperties = { position: 'absolute', width: 0, height: 0 };
  if (dir === 'left')  return <div style={{ ...base, left: -11, top: '50%', transform: 'translateY(-50%)', borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderRight: `11px solid ${accent}` }} />;
  if (dir === 'right') return <div style={{ ...base, right: -11, top: '50%', transform: 'translateY(-50%)', borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderLeft: `11px solid ${accent}` }} />;
  return <div style={{ ...base, top: -11, left: '50%', transform: 'translateX(-50%)', borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: `11px solid ${accent}` }} />;
}

export function Tour({ role }: { role: 'employee' | 'pm' | 'lead' }) {
  const steps      = role === 'pm' || role === 'lead' ? PM_STEPS : EMPLOYEE_STEPS;
  const storageKey = (role === 'pm' || role === 'lead') ? KEY_PM : KEY_EMP;

  const [active, setActive]         = useState(false);
  const [step, setStep]             = useState(0);
  const [rect, setRect]             = useState<TargetRect | null>(null);
  const [tooltipPos, setTPos]       = useState<React.CSSProperties>({});
  const [arrow, setArrow]           = useState<'left' | 'right' | 'top' | null>(null);
  const [animDir, setAnimDir]       = useState<'forward' | 'back'>('forward');
  const [animKey, setAnimKey]       = useState(0);

  const current = steps[step];
  const pct     = Math.round(((step + 1) / steps.length) * 100);

  const recalc = useCallback(() => {
    if (!active || !current.target) { setRect(null); return; }
    const r = getTargetRect(current.target);
    setRect(r);
    if (r) { setTPos(tooltipStyle(r, current.placement)); setArrow(arrowDir(r, current.placement)); }
  }, [active, current]);

  useEffect(() => {
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

  function skip() { setActive(false); }

  function next() {
    setAnimDir('forward');
    setAnimKey(k => k + 1);
    if (step < steps.length - 1) setStep(s => s + 1);
    else complete();
  }

  function prev() {
    if (step === 0) return;
    setAnimDir('back');
    setAnimKey(k => k + 1);
    setStep(s => s - 1);
  }

  if (!active) return null;
  const isCentered = !current.target;

  return (
    <>
      <style>{`
        @keyframes tour-overlay-in {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes tour-slide-forward {
          from { opacity: 0; transform: translateX(18px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes tour-slide-back {
          from { opacity: 0; transform: translateX(-18px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes tour-spotlight-pulse {
          0%, 100% { opacity: 0.85; }
          50%       { opacity: 1; }
        }
        @keyframes tour-intro-pop {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.88) translateY(12px); }
          70%  { transform: translate(-50%,-50%) scale(1.02) translateY(-2px); }
          100% { opacity: 1; transform: translate(-50%,-50%) scale(1) translateY(0); }
        }
      `}</style>

      {/* SVG spotlight */}
      {!isCentered && rect && (
        <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9991, pointerEvents: 'none', animation: 'tour-overlay-in 0.25s ease' }}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect x={rect.x - PAD} y={rect.y - PAD} width={rect.w + PAD * 2} height={rect.h + PAD * 2} rx="10" fill="black" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(4,14,28,0.72)" mask="url(#tour-mask)" />
          <rect
            x={rect.x - PAD} y={rect.y - PAD} width={rect.w + PAD * 2} height={rect.h + PAD * 2}
            rx="10" fill="none"
            stroke={current.accent} strokeWidth="2.5"
            style={{ filter: `drop-shadow(0 0 8px ${current.accent})`, animation: 'tour-spotlight-pulse 2s ease-in-out infinite' }}
          />
        </svg>
      )}

      {/* Dark overlay for intro card */}
      {isCentered && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9991, background: 'rgba(4,14,28,0.75)', backdropFilter: 'blur(2px)', animation: 'tour-overlay-in 0.3s ease' }}
          onClick={skip} />
      )}

      {/* Tooltip card */}
      <div
        key={animKey}
        style={{
          zIndex: 10001,
          animation: isCentered
            ? 'tour-intro-pop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards'
            : animDir === 'forward'
            ? 'tour-slide-forward 0.22s ease-out forwards'
            : 'tour-slide-back 0.22s ease-out forwards',
          ...(isCentered
            ? { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: Math.min(360, window.innerWidth - 32) }
            : tooltipPos),
        }}
      >
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ border: `1.5px solid ${current.accent}55`, background: '#fff', boxShadow: `0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px ${current.accent}20` }}>

          {!isCentered && <Arrow dir={arrow} accent={current.accent} />}

          {/* Progress bar header */}
          <div style={{ background: `linear-gradient(135deg, ${current.accent}18 0%, ${current.accent}08 100%)`, borderBottom: `1px solid ${current.accent}20` }}
            className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: current.accent }}>
                {current.tag || ((role === 'pm' || role === 'lead') ? 'Lead Tour' : 'Getting started')}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono">{step + 1} / {steps.length}</span>
                <button onClick={skip} className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                  <X size={11} />
                </button>
              </div>
            </div>
            {/* Progress bar — like a validation run */}
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${current.accent}, ${current.accent}bb)` }} />
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: `${current.accent}14` }}>
                {current.emoji}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-base font-black text-slate-900 tracking-tight leading-tight">{current.title}</h3>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">{current.body}</p>

            {/* Actions */}
            <div className="flex items-center justify-between mt-4">
              <button onClick={skip} className="text-xs text-slate-300 hover:text-slate-500 transition-colors">
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button onClick={prev}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all border border-slate-200">
                    <ArrowLeft size={11} /> Back
                  </button>
                )}
                <button onClick={next}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${current.accent}, ${current.accent}cc)`, boxShadow: `0 2px 8px ${current.accent}40` }}>
                  {step < steps.length - 1
                    ? <><span>Next</span><ArrowRight size={11} /></>
                    : <span>Done — let's go 🚀</span>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function resetTour(role: 'employee' | 'pm' | 'lead') {
  try { localStorage.removeItem((role === 'pm' || role === 'lead') ? KEY_PM : KEY_EMP); } catch {}
}

export function completeTour(role: 'employee' | 'pm' | 'lead') {
  try { localStorage.setItem((role === 'pm' || role === 'lead') ? KEY_PM : KEY_EMP, 'done'); } catch {}
}
