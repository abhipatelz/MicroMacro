'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, FolderKanban, Users, ListChecks, Kanban, Sun, ArrowRight, X } from 'lucide-react';

// Authoritative state lives on the User record server-side (User.hasSeenTour),
// so once dismissed the tour never reappears even on a new browser / device.
// localStorage is used only as a fast-path to avoid a brief flash on the next
// render after dismissal.
const STORAGE_KEY = 'pragati-tour-v1';

interface Step {
  title: string;
  body: string;
  icon: any;
  iconBg: string;
  iconColor: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to Pragati",
    body:  "A bird's-eye view of your projects. Everything you need to lead your team — projects, actions, and people — on a single page.",
    icon: Sparkles,
    iconBg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
    iconColor: '#1565C0',
  },
  {
    title: 'Your projects, fully visible',
    body:  "Each ongoing project shows its tasks, who's on them, target completion dates and live status. Tap a project to drill in.",
    icon: FolderKanban,
    iconBg: 'linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%)',
    iconColor: '#7B1FA2',
  },
  {
    title: 'Actions that need you',
    body:  'The Actions panel surfaces what is due this week, next week, this month — or until any custom date. Catch things before they slip.',
    icon: ListChecks,
    iconBg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
    iconColor: '#B45309',
  },
  {
    title: 'Your team at a glance',
    body:  "See each contributor's open work, due dates, and load. Spot overloads before they become bottlenecks.",
    icon: Users,
    iconBg: 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)',
    iconColor: '#2E7D32',
  },
  {
    title: 'Drag tasks across the board',
    body:  'Open any project to its Kanban board. Drag a card between columns to move it through To do → In progress → Done, or grab the handle to reorder within a phase. The board saves instantly.',
    icon: Kanban,
    iconBg: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)',
    iconColor: '#0369A1',
  },
  {
    title: 'Start your day in My Day',
    body:  'A private scratchpad for the loose thoughts a spreadsheet can’t hold — jot what is on your mind, then turn the keepers into real tasks. It’s only ever visible to you.',
    icon: Sun,
    iconBg: 'linear-gradient(135deg, #FEF9C3 0%, #FDE68A 100%)',
    iconColor: '#A16207',
  },
];

export function FirstTimeTour({ alreadySeen = false }: { alreadySeen?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen]       = useState(false);
  const [step, setStep]       = useState(0);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    if (alreadySeen) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    // Slight delay so the dashboard finishes its entry animation first.
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [alreadySeen]);

  function close() {
    setOpen(false);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1');
    // Fire-and-forget: persist on the user record so the tour never returns
    // on another browser / device. Failure is non-fatal.
    fetch('/api/me/tour-seen', { method: 'POST', credentials: 'include' }).catch(() => {});
  }

  if (!mounted || !open) return null;

  const s   = STEPS[step];
  const Icn = s.icon;
  const last = step === STEPS.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(8, 16, 32, 0.55)', backdropFilter: 'blur(4px)' }}
      onClick={close}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden modal-in"
      >
        {/* Top hero */}
        <div className="relative px-7 pt-7 pb-5"
          style={{ background: 'linear-gradient(160deg, #F8FAFC 0%, #FFFFFF 100%)' }}>
          <button
            onClick={close}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close tour"
          >
            <X size={14} />
          </button>

          {/* Big rounded icon */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: s.iconBg,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(15,23,42,0.06)',
            }}>
            <Icn size={26} style={{ color: s.iconColor }} />
          </div>

          <h2 className="text-xl font-black text-slate-900 tracking-tight">{s.title}</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{s.body}</p>
        </div>

        {/* Bottom */}
        <div className="px-7 pb-6 pt-2 flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-blue-600' : i < step ? 'w-1.5 bg-blue-300' : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2.5 py-2 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => last ? close() : setStep(s => s + 1)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white rounded-xl px-4 py-2.5 transition-all"
              style={{
                background: 'linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)',
                boxShadow: '0 4px 12px rgba(21,101,192,0.32)',
              }}
            >
              {last ? "Let's go" : 'Next'}
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
