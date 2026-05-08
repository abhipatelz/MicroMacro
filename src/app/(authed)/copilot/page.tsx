'use client';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { formatDate } from '@/components/ui';
import { Bot, Send, Plus, CheckCircle2, Loader2, RotateCcw, Sparkles, Clock, ChevronRight, Shield } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  steps?: string[];
  stepsAdded?: boolean[];
}

// Starter prompts tailored to each task type
const TYPE_STARTERS: Record<string, { emoji: string; text: string }[]> = {
  deviation: [
    { emoji: '⚠️', text: 'How do I classify the severity of this deviation — minor, major, or critical?' },
    { emoji: '🔍', text: 'What root cause analysis method should I use for this deviation?' },
    { emoji: '📋', text: 'What evidence do I need to collect before closing this deviation?' },
    { emoji: '🔒', text: 'Do I need a CAPA or is the deviation corrective action sufficient?' },
  ],
  capa: [
    { emoji: '🌿', text: 'Walk me through a 5-Why analysis for a CAPA.' },
    { emoji: '✅', text: 'What makes a strong effectiveness check for a CAPA?' },
    { emoji: '📝', text: 'What is the difference between the corrective and preventive action?' },
    { emoji: '⏱️', text: 'How long should a CAPA stay open before it\'s considered overdue?' },
  ],
  corrective_action: [
    { emoji: '🌿', text: 'Walk me through a 5-Why analysis for a CAPA.' },
    { emoji: '✅', text: 'What makes a strong effectiveness check for a CAPA?' },
    { emoji: '📝', text: 'What is the difference between the corrective and preventive action?' },
    { emoji: '⏱️', text: 'How long should a CAPA stay open before it\'s considered overdue?' },
  ],
  test: [
    { emoji: '🖥️', text: 'What is the difference between OQ and PQ testing?' },
    { emoji: '📋', text: 'What do I need in a test protocol before QA can approve it?' },
    { emoji: '❌', text: 'A test step failed — do I need a deviation?' },
    { emoji: '✍️', text: 'How should I document a test execution to satisfy an auditor?' },
  ],
  audit_finding: [
    { emoji: '🔍', text: 'How do I respond to a 483 observation effectively?' },
    { emoji: '📝', text: 'What root cause analysis is expected for an audit finding response?' },
    { emoji: '⏱️', text: 'What is the typical timeframe to respond to an FDA 483?' },
    { emoji: '📋', text: 'What evidence should I attach to an audit finding CAPA?' },
  ],
  finding: [
    { emoji: '🔍', text: 'How do I respond to a 483 observation effectively?' },
    { emoji: '📝', text: 'What root cause analysis is expected for an audit finding response?' },
    { emoji: '📋', text: 'What evidence should I attach to an audit finding CAPA?' },
    { emoji: '🔒', text: 'How do I classify an audit finding — observation vs major vs critical?' },
  ],
  review: [
    { emoji: '📋', text: 'What does a second-person review in GxP context require?' },
    { emoji: '🔒', text: 'Can a reviewer sign off on a document they also authored?' },
    { emoji: '📝', text: 'What evidence should a data review record contain?' },
    { emoji: '✅', text: 'What are the ALCOA+ principles for a compliant review record?' },
  ],
  data_review: [
    { emoji: '🔒', text: 'What ALCOA+ principles apply to data review records?' },
    { emoji: '📋', text: 'How do I handle an unexpected result found during data review?' },
    { emoji: '🔍', text: 'What counts as raw data vs processed data under FDA guidance?' },
    { emoji: '✍️', text: 'How should I document a data integrity finding during review?' },
  ],
  approval: [
    { emoji: '✅', text: 'What does a QA approver need to verify before signing off?' },
    { emoji: '🔒', text: 'What are the electronic signature requirements under 21 CFR Part 11?' },
    { emoji: '📋', text: 'Can an approval be retracted after it has been given?' },
    { emoji: '⏱️', text: 'What is the maximum acceptable delay between completion and approval sign-off?' },
  ],
};

const GENERIC_STARTERS = [
  { emoji: '⚠️', text: 'We ran a test script on a production system without approval. What do we need to do?' },
  { emoji: '📝', text: 'I need to update a validated LIMS. Walk me through change control.' },
  { emoji: '🔍', text: 'An auditor found our audit trail was disabled for 2 days. What now?' },
  { emoji: '💊', text: 'A batch was released with an out-of-spec result. What process applies?' },
  { emoji: '🖥️', text: 'We changed a configuration in our chromatography software. Do we need a deviation?' },
  { emoji: '📋', text: 'What is the difference between a CAPA and a deviation?' },
  { emoji: '🔒', text: 'Someone used a shared login to approve a document. Is this a data integrity issue?' },
  { emoji: '🛡️', text: 'What GxP category is our custom web application under GAMP 5?' },
];

function parseSteps(text: string): string[] {
  const match = text.match(/---STEPS---([\s\S]*?)---END STEPS---/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(l => l.replace(/^\d+\.\s*/, '').trim())
    .filter(l => l.length > 0);
}

function cleanContent(text: string): string {
  return text.replace(/---STEPS---[\s\S]*?---END STEPS---/, '').trim();
}

function MessageBubble({ msg, projects, userId, onStepAdded }: {
  msg: Message; projects: any[]; userId: string;
  onStepAdded: (stepIdx: number) => void;
}) {
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const [projectId, setProjectId] = useState('');

  async function addStep(step: string, idx: number) {
    if (!projectId) { alert('Select a project first.'); return; }
    setAddingIdx(idx);
    try {
      await api('/tasks', { method: 'POST', body: { title: step, projectId, assigneeId: userId } });
      onStepAdded(idx);
    } finally { setAddingIdx(null); }
  }

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  const display = cleanContent(msg.content);
  const steps   = msg.steps ?? [];

  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Bot size={15} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap prose-sm">
            {display || <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm" />}
          </div>
        </div>

        {steps.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Your next steps</div>
              <select
                className="select text-xs py-1 h-auto w-auto"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">Pick project to add tasks →</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>
                ))}
              </select>
            </div>
            <ol className="space-y-2">
              {steps.map((step, i) => {
                const added = msg.stepsAdded?.[i];
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span className={`flex-1 text-sm leading-snug ${added ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {step}
                    </span>
                    <button
                      onClick={() => !added && addStep(step, i)}
                      disabled={added || addingIdx === i}
                      className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-all ${
                        added
                          ? 'text-green-600 bg-green-50 border border-green-200 cursor-default'
                          : 'text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      {addingIdx === i
                        ? <Loader2 size={10} className="animate-spin" />
                        : added
                        ? <><CheckCircle2 size={10} /> Added</>
                        : <><Plus size={10} /> Add task</>
                      }
                    </button>
                  </li>
                );
              })}
            </ol>
            {steps.some((_, i) => !msg.stepsAdded?.[i]) && projectId && (
              <button
                onClick={() => steps.forEach((s, i) => { if (!msg.stepsAdded?.[i]) addStep(s, i); })}
                className="w-full btn-primary text-xs py-2 justify-center gap-1.5"
              >
                <Plus size={12} /> Add all steps to {projects.find(p => p.id === projectId)?.code || 'project'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Strip task type to a KB-friendly keyword for auto-seed messages
function taskTypeLabel(type: string): string {
  const map: Record<string, string> = {
    task: 'task', review: 'document review', approval: 'approval', test: 'system test',
    deviation: 'deviation', capa: 'CAPA', corrective_action: 'CAPA',
    audit_finding: 'audit finding', finding: 'audit finding', data_review: 'data review',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function buildSeedMessage(task: any): string {
  const type  = taskTypeLabel(task.taskType ?? 'task');
  const flags = [
    task.gxpCritical ? 'GxP / Compliance critical' : null,
    task.requiresQaSignoff ? 'requires QA sign-off' : null,
  ].filter(Boolean).join(', ');

  const parts: string[] = [
    `I'm working on a ${type}: "${task.title}".`,
    `Project: ${task.projectName || task.projectCode || 'N/A'}.`,
    `Status: ${task.status?.replace(/_/g, ' ')}, Priority: ${task.priority}.`,
  ];
  if (flags) parts.push(`Flags: ${flags}.`);
  parts.push('What are the key QA and compliance steps I should follow to complete this correctly?');

  return parts.join(' ');
}

// Similar tasks panel shown after context is loaded
function SimilarTasksPanel({ taskId, taskType }: { taskId: string; taskType: string }) {
  const [similar, setSimilar] = useState<any[] | null>(null);
  const [open, setOpen]       = useState(false);

  async function load() {
    if (similar !== null) { setOpen(v => !v); return; }
    const data = await api<{ similar: any[] }>(`/copilot/similar?taskId=${taskId}`).catch(() => ({ similar: [] }));
    setSimilar(data.similar);
    setOpen(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
      <button
        onClick={load}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:text-brand-700 hover:bg-slate-100 transition-colors"
      >
        <Clock size={12} className="shrink-0 text-slate-400" />
        Find similar {taskType.replace(/_/g,' ')} tasks from the past
        <ChevronRight size={11} className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-slate-200 px-3 pb-3 pt-2 space-y-2">
          {similar === null && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 py-1">
              <Loader2 size={11} className="animate-spin" /> Loading…
            </div>
          )}
          {similar?.length === 0 && (
            <p className="text-xs text-slate-400 py-1">No closed tasks of this type in this project yet.</p>
          )}
          {similar && similar.length > 0 && similar.map((t: any) => (
            <a
              key={t.id}
              href={`/tasks/${t.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 group"
            >
              <CheckCircle2 size={12} className="text-green-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-700 font-medium group-hover:text-brand-700 truncate transition-colors">{t.title}</div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  {t.completedAt && <span>Closed {formatDate(t.completedAt)}</span>}
                  {t.gxpCritical && <><span>·</span><Shield size={9} className="text-red-400" /><span className="text-red-400">GxP</span></>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Inner page needs useSearchParams, must be wrapped in Suspense by the export
function CopilotInner() {
  const searchParams  = useSearchParams();
  const taskIdParam   = searchParams.get('taskId');

  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState('');
  const [streaming, setStreaming]     = useState(false);
  const [projects, setProjects]       = useState<any[]>([]);
  const [me, setMe]                   = useState<any>(null);
  const [mode, setMode]               = useState<'llm' | 'kb' | null>(null);

  // Task context (when launched from a task page)
  const [taskCtx, setTaskCtx]         = useState<any>(null);
  const [taskLoading, setTaskLoading] = useState(!!taskIdParam);
  const seededRef                     = useRef(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<any[]>('/projects').then(setProjects);
    api<any>('/auth/me').then(d => setMe(d.user));
  }, []);

  // Load task context if taskId is in URL
  useEffect(() => {
    if (!taskIdParam) return;
    setTaskLoading(true);
    api<any>(`/tasks/${taskIdParam}`)
      .then(t => { setTaskCtx(t); setTaskLoading(false); })
      .catch(() => setTaskLoading(false));
  }, [taskIdParam]);

  // Auto-seed conversation once task is loaded
  useEffect(() => {
    if (!taskCtx || seededRef.current) return;
    seededRef.current = true;
    send(buildSeedMessage(taskCtx));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskCtx]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput('');

    const userMsg: Message = { role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...history, assistantMsg]);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content }))
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || `Error ${res.status} — please try again.`;
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: errMsg };
          return copy;
        });
        return;
      }

      // Pick up the runtime mode from the response header (LLM vs KB-only)
      const m = res.headers.get('X-Copilot-Mode');
      if (m === 'llm' || m === 'kb') setMode(m);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: full };
          return copy;
        });
      }

      const steps = parseSteps(full);
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant', content: full,
          steps, stepsAdded: steps.map(() => false),
        };
        return copy;
      });
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: 'Connection error. Please try again.' };
        return copy;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function markStepAdded(msgIdx: number, stepIdx: number) {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx) return m;
      const stepsAdded = [...(m.stepsAdded ?? [])];
      stepsAdded[stepIdx] = true;
      return { ...m, stepsAdded };
    }));
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function reset() {
    setMessages([]);
    setTaskCtx(null);
    seededRef.current = false;
    // Remove taskId from URL without full reload
    window.history.replaceState({}, '', '/copilot');
  }

  const empty    = messages.length === 0;
  const starters = taskCtx
    ? (TYPE_STARTERS[taskCtx.taskType] ?? GENERIC_STARTERS)
    : GENERIC_STARTERS;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">QA Copilot</h1>
              {mode === 'llm' && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-forest-700 bg-forest-50 border border-forest-200 px-1.5 py-0.5 rounded-full">
                  Live AI
                </span>
              )}
              {mode === 'kb' && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                  KB mode
                </span>
              )}
            </div>
            {taskCtx ? (
              <p className="text-[11px] text-brand-600 font-semibold truncate max-w-[300px]">
                <Sparkles size={9} className="inline mr-0.5 -mt-0.5" />
                Context: {taskCtx.title}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400">Ask anything about QA — conversational, regulation-grounded, with one-click task creation.</p>
            )}
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="btn-ghost text-xs flex items-center gap-1.5 text-slate-400">
            <RotateCcw size={12} /> New chat
          </button>
        )}
      </div>

      {/* KB-mode banner — shows once a response has come back without a key set */}
      {mode === 'kb' && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
          <span className="text-base shrink-0">💡</span>
          <div>
            <strong>Running in knowledge-base mode.</strong> Answers come from a curated regulatory KB rather than a live LLM.
            For richer, conversational answers, set <code className="bg-amber-100 px-1 rounded font-mono">GEMINI_API_KEY</code> on the server (free, no credit card at <strong>aistudio.google.com → Get API key</strong>).
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {/* Task context banner */}
        {taskCtx && messages.length > 0 && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5 flex items-start gap-2.5 fade-in-soft">
            <Sparkles size={13} className="text-brand-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-brand-700 mb-0.5">{taskCtx.title}</div>
              <div className="text-[10px] text-brand-500 flex flex-wrap gap-x-2">
                <span className="capitalize">{taskCtx.taskType?.replace(/_/g, ' ')}</span>
                <span>·</span>
                <span className="capitalize">{taskCtx.status?.replace(/_/g, ' ')}</span>
                <span>·</span>
                <span className="capitalize">{taskCtx.priority} priority</span>
                {taskCtx.gxpCritical && <><span>·</span><span className="text-red-500 font-semibold">GxP critical</span></>}
              </div>
            </div>
            <a href={`/tasks/${taskCtx.id}`} className="text-[10px] text-brand-400 hover:text-brand-700 shrink-0 transition-colors">
              View task →
            </a>
          </div>
        )}

        {/* Similar tasks — shown once we have task context and at least one reply */}
        {taskCtx && messages.some(m => m.role === 'assistant' && m.content.length > 10) && (
          <SimilarTasksPanel taskId={taskCtx.id} taskType={taskCtx.taskType ?? 'task'} />
        )}

        {empty ? (
          taskLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 size={28} className="text-brand-400 animate-spin" />
              <p className="text-sm text-slate-400">Loading task context…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-6 pb-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center mx-auto shadow-lg">
                  <Bot size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-black text-slate-900">QA Copilot</h2>
                <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
                  {taskCtx
                    ? `Advising on: ${taskCtx.title}`
                    : 'Your guide through any pharma QA process. Ask about deviations, CAPAs, change controls, CSV, data integrity — or anything that\'s blocking you.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {starters.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s.text)}
                    className="flex items-start gap-2.5 text-left px-3.5 py-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 transition-all text-sm text-slate-700 group"
                  >
                    <span className="text-base shrink-0 mt-0.5">{s.emoji}</span>
                    <span className="leading-snug group-hover:text-blue-700 transition-colors">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              projects={projects}
              userId={me?.id ?? ''}
              onStepAdded={(stepIdx) => markStepAdded(i, stepIdx)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-slate-100">
        <div className="flex gap-2 items-end bg-white border border-slate-200 rounded-2xl px-3 py-2 shadow-sm focus-within:border-blue-400 focus-within:shadow-blue-100/50 focus-within:shadow-md transition-all">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400 outline-none bg-transparent py-1.5 max-h-40"
            placeholder={taskCtx
              ? `Ask a follow-up about "${taskCtx.title}"…`
              : 'Ask anything about QA — deviations, CAPA, change control, CSV, data integrity…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 disabled:opacity-40"
            style={{ background: input.trim() && !streaming ? 'linear-gradient(135deg,#1256B0,#1769C8)' : '#e2e8f0' }}
          >
            {streaming
              ? <Loader2 size={16} className="text-blue-600 animate-spin" />
              : <Send size={15} className={input.trim() ? 'text-white' : 'text-slate-400'} />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-300 text-center mt-2">
          QA Copilot can make mistakes. Always verify with your QA lead for regulated actions.
        </p>
      </div>
    </div>
  );
}

export default function CopilotPage() {
  return (
    <Suspense>
      <CopilotInner />
    </Suspense>
  );
}
