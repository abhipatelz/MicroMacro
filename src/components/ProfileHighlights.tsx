'use client';
import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, ChevronLeft, ChevronRight, Sparkles, Trash2, Pencil } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * Profile Highlights — story-style, but text only.
 *
 * A glanceable row of rings at the top of a profile. Each ring is a short
 * highlight of what the person is building, an insight, or a high-value goal.
 * Tapping opens a minimal full-screen reader (tap right/left to move, like a
 * story). The owner gets a "+" ring to add one and can edit / delete from the
 * reader; colleagues can cheer with a lightweight reaction.
 *
 * Deliberately not fancy: no images, no auto-advancing timers — just the
 * person's own words, framed nicely, with a little encouragement.
 */

// Curated reaction set — mirrors src/lib/highlights.ts (server validates).
const REACTIONS = ['👏', '❤️', '💡', '🚀', '🎯'] as const;
// A highlight posted within this window gets a "new" dot on its ring.
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
function isNew(createdAt?: string) {
  return !!createdAt && Date.now() - new Date(createdAt).getTime() < NEW_WINDOW_MS;
}

type Highlight = {
  id: string;
  title: string;
  body: string;
  accent: string;
  createdAt?: string;
  reactions: { emoji: string; count: number }[];
  totalReactions: number;
  myReaction: string | null;
};

const ACCENTS: Record<string, { grad: string; text: string }> = {
  blue: { grad: 'from-blue-500 to-indigo-500', text: '#1d4ed8' },
  green: { grad: 'from-emerald-500 to-teal-500', text: '#047857' },
  violet: { grad: 'from-violet-500 to-fuchsia-500', text: '#7c3aed' },
  amber: { grad: 'from-amber-400 to-orange-500', text: '#b45309' },
  rose: { grad: 'from-rose-500 to-pink-500', text: '#be123c' },
  slate: { grad: 'from-slate-500 to-slate-700', text: '#334155' },
};
const ACCENT_KEYS = Object.keys(ACCENTS);

function accentOf(a: string) {
  return ACCENTS[a] || ACCENTS.blue;
}

export function ProfileHighlights({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [items, setItems] = useState<Highlight[] | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Highlight | null>(null);

  const load = useCallback(() => {
    api<{ highlights: Highlight[] }>(`/users/${userId}/highlights`)
      .then((d) => setItems(d.highlights || []))
      .catch(() => setItems([]));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    setItems((xs) => (xs || []).filter((x) => x.id !== id));
    setViewer(null);
    await api(`/users/${userId}/highlights/${id}`, { method: 'DELETE' }).catch(() => load());
  }

  // Toggle a reaction. Server returns the authoritative summary (counts +
  // the viewer's own selection), so we just swap the reaction fields in.
  async function react(id: string, emoji: string) {
    try {
      const updated = await api<Highlight>(`/users/${userId}/highlights/${id}/react`, {
        method: 'POST',
        body: { emoji },
      });
      setItems((xs) =>
        (xs || []).map((x) =>
          x.id === id
            ? {
                ...x,
                reactions: updated.reactions,
                totalReactions: updated.totalReactions,
                myReaction: updated.myReaction,
              }
            : x,
        ),
      );
    } catch {
      /* best-effort — a failed cheer shouldn't surface an error */
    }
  }

  // Nothing to show and not the owner → render nothing (no empty shell).
  if (items && items.length === 0 && !isSelf) return null;
  // Still loading and not owner: hold space-free.
  if (items === null && !isSelf) return null;

  return (
    <div className="px-1">
      <div className="flex items-start gap-4 overflow-x-auto no-scrollbar py-1">
        {isSelf && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex flex-col items-center gap-1.5 shrink-0 w-[72px] group"
            title="Add a highlight"
          >
            <span className="w-16 h-16 rounded-full border-2 border-dashed border-slate-300 dark:border-white/15 flex items-center justify-center text-slate-400 group-hover:border-blue-400 group-hover:text-blue-500 transition-colors">
              <Plus size={22} />
            </span>
            <span className="text-[11px] text-slate-400 dark:text-white/40 font-medium">Add</span>
          </button>
        )}

        {(items || []).map((h, i) => {
          const a = accentOf(h.accent);
          const top = h.reactions[0];
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => setViewer(i)}
              className="flex flex-col items-center gap-1.5 shrink-0 w-[72px] group"
              title={h.title}
            >
              <span className={`relative w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-br ${a.grad}`}>
                <span className="w-full h-full rounded-full bg-white dark:bg-[#1e1e1c] flex items-center justify-center">
                  <span
                    className={`w-[54px] h-[54px] rounded-full bg-gradient-to-br ${a.grad} opacity-[0.12] flex items-center justify-center`}
                  >
                    <Sparkles size={20} style={{ color: a.text }} className="opacity-90" />
                  </span>
                </span>
                {/* "New" dot — posted within the last week. */}
                {isNew(h.createdAt) && (
                  <span
                    aria-label="New"
                    className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-[#1e1e1c]"
                  />
                )}
                {/* Reaction tally — top emoji + total. */}
                {h.totalReactions > 0 && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 rounded-full bg-white dark:bg-[#262624] border border-slate-200 dark:border-white/10 px-1.5 py-px text-[10px] font-bold text-slate-600 dark:text-white/70 shadow-sm leading-none">
                    <span>{top?.emoji || '👏'}</span>
                    {h.totalReactions}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-white/55 font-medium leading-tight text-center line-clamp-2 w-full group-hover:text-slate-800 dark:group-hover:text-white/80 transition-colors">
                {h.title}
              </span>
            </button>
          );
        })}
      </div>

      {viewer !== null && items && items[viewer] && (
        <HighlightViewer
          items={items}
          index={viewer}
          isSelf={isSelf}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          onDelete={remove}
          onReact={react}
          onEdit={(h) => {
            setViewer(null);
            setEditing(h);
          }}
        />
      )}

      {(composing || editing) && (
        <HighlightComposer
          userId={userId}
          initial={editing || undefined}
          onClose={() => {
            setComposing(false);
            setEditing(null);
          }}
          onCreated={(h) => {
            setItems((xs) => [h, ...(xs || [])]);
            setComposing(false);
          }}
          onSaved={(h) => {
            setItems((xs) => (xs || []).map((x) => (x.id === h.id ? h : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Full-screen reader ─────────────────────────────────────────────────────── */
function HighlightViewer({
  items,
  index,
  isSelf,
  onIndex,
  onClose,
  onDelete,
  onReact,
  onEdit,
}: {
  items: Highlight[];
  index: number;
  isSelf: boolean;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onEdit: (h: Highlight) => void;
}) {
  const h = items[index];
  const a = accentOf(h.accent);
  const prev = () => (index > 0 ? onIndex(index - 1) : onClose());
  const next = () => (index < items.length - 1 ? onIndex(index + 1) : onClose());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  const when =
    h.createdAt &&
    new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overlay-in">
      {/* Progress segments — story style */}
      <div className="absolute top-3 left-0 right-0 flex gap-1.5 px-4 max-w-md mx-auto">
        {items.map((_, i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full ${i <= index ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>

      <button
        onClick={onClose}
        className="absolute top-6 right-5 text-white/70 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {/* Tap zones */}
      <button
        className="absolute inset-y-0 left-0 w-1/3 cursor-default"
        onClick={prev}
        aria-label="Previous"
      />
      <button className="absolute inset-y-0 right-0 w-1/3 cursor-default" onClick={next} aria-label="Next" />

      {index > 0 && (
        <button
          onClick={prev}
          className="absolute left-3 sm:left-6 text-white/60 hover:text-white transition-colors hidden sm:block"
          aria-label="Previous"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {index < items.length - 1 && (
        <button
          onClick={next}
          className="absolute right-3 sm:right-6 text-white/60 hover:text-white transition-colors hidden sm:block"
          aria-label="Next"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Card */}
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#1e1e1c] shadow-2xl overflow-hidden modal-in">
        <div className={`h-1.5 bg-gradient-to-r ${a.grad}`} />
        <div className="p-7">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`w-9 h-9 rounded-full bg-gradient-to-br ${a.grad} flex items-center justify-center shrink-0`}
            >
              <Sparkles size={16} className="text-white" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: a.text }}>
              Highlight
            </span>
            {when && <span className="text-[11px] text-slate-400 ml-auto">{when}</span>}
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white leading-snug">{h.title}</h3>
          {h.body && (
            <p className="mt-3 text-[15px] text-slate-600 dark:text-white/65 leading-relaxed whitespace-pre-wrap">
              {h.body}
            </p>
          )}

          {/* Reactions — colleagues cheer; the owner sees the tally read-only. */}
          <div className="mt-6 flex items-center gap-1.5 flex-wrap">
            {REACTIONS.map((e) => {
              const found = h.reactions.find((r) => r.emoji === e);
              const count = found?.count || 0;
              const mine = h.myReaction === e;
              if (isSelf) {
                if (!count) return null;
                return (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-2.5 py-1 text-[13px] font-semibold text-slate-600 dark:text-white/70 leading-none"
                  >
                    <span>{e}</span> {count}
                  </span>
                );
              }
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => onReact(h.id, e)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[14px] leading-none transition-all hover:scale-105 ${
                    mine
                      ? 'border-blue-300 bg-blue-50 dark:bg-blue-500/15 dark:border-blue-400/40'
                      : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:border-slate-300'
                  }`}
                  aria-pressed={mine}
                  aria-label={`React ${e}`}
                >
                  <span>{e}</span>
                  {count > 0 && (
                    <span className="text-[12px] font-bold text-slate-600 dark:text-white/70">{count}</span>
                  )}
                </button>
              );
            })}
            {isSelf && h.totalReactions === 0 && (
              <span className="text-[12px] text-slate-400">
                No reactions yet — share what you're building.
              </span>
            )}
          </div>

          {isSelf && (
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-end gap-4">
              <button
                onClick={() => onEdit(h)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-blue-500 transition-colors"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={() => onDelete(h.id)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Composer ───────────────────────────────────────────────────────────────── */
function HighlightComposer({
  userId,
  initial,
  onClose,
  onCreated,
  onSaved,
}: {
  userId: string;
  initial?: Highlight;
  onClose: () => void;
  onCreated: (h: Highlight) => void;
  onSaved: (h: Highlight) => void;
}) {
  const editingId = initial?.id;
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  const [accent, setAccent] = useState(initial?.accent || 'blue');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setErr('');
    try {
      if (editingId) {
        const h = await api<Highlight>(`/users/${userId}/highlights/${editingId}`, {
          method: 'PATCH',
          body: { title: title.trim(), body: body.trim(), accent },
        });
        onSaved(h);
      } else {
        const h = await api<Highlight>(`/users/${userId}/highlights`, {
          method: 'POST',
          body: { title: title.trim(), body: body.trim(), accent },
        });
        onCreated(h);
      }
    } catch (e: any) {
      setErr(e.message || 'Could not save.');
      setSaving(false);
    }
  }

  const a = accentOf(accent);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overlay-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#1e1e1c] shadow-2xl overflow-hidden modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1.5 bg-gradient-to-r ${a.grad}`} />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`w-9 h-9 rounded-full bg-gradient-to-br ${a.grad} flex items-center justify-center shrink-0`}
            >
              <Sparkles size={16} className="text-white" />
            </span>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              {editingId ? 'Edit highlight' : 'New highlight'}
            </h3>
            <button
              onClick={onClose}
              className="ml-auto p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white/70 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-[12px] text-slate-400 dark:text-white/40 mb-3 leading-snug">
            What are you building, learning, or aiming for? Keep it short — the highlight of your week.
          </p>

          <input
            autoFocus
            className="input w-full"
            placeholder="What you're building (e.g. “Cutting release cycle to 2 weeks”)"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="input w-full mt-2.5 resize-none"
            rows={3}
            placeholder="Optional — the insight or detail behind it."
            value={body}
            maxLength={280}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Accent</span>
            <div className="flex items-center gap-1.5">
              {ACCENT_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAccent(k)}
                  className={`w-6 h-6 rounded-full bg-gradient-to-br ${accentOf(k).grad} transition-transform ${
                    accent === k
                      ? 'ring-2 ring-offset-2 ring-slate-300 dark:ring-offset-[#1e1e1c] scale-110'
                      : 'hover:scale-105'
                  }`}
                  aria-label={k}
                />
              ))}
            </div>
          </div>

          {err && <p className="text-[12px] text-red-500 mt-3">{err}</p>}

          <div className="flex items-center justify-end gap-2 mt-5">
            <button onClick={onClose} className="btn-ghost text-sm">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !title.trim()} className="btn-primary text-sm">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Post highlight'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
