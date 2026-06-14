import { Types } from 'mongoose';

/**
 * Shared highlight helpers — the curated accent + reaction palettes and the
 * single serializer used by every highlight route, so the client always
 * receives the same shape (and a client can never inject arbitrary CSS or an
 * off-palette emoji).
 */

// Ring gradient / viewer accent. Mirrored in ProfileHighlights' ACCENTS map.
export const HIGHLIGHT_ACCENTS = ['blue', 'green', 'violet', 'amber', 'rose', 'slate'] as const;
export type HighlightAccent = (typeof HIGHLIGHT_ACCENTS)[number];

// A tiny, deliberate reaction set — lightweight workplace encouragement, not a
// full emoji keyboard. Order here is the display order in the reaction bar.
export const HIGHLIGHT_REACTIONS = ['👏', '❤️', '💡', '🚀', '🎯'] as const;
export type HighlightReaction = (typeof HIGHLIGHT_REACTIONS)[number];

export type SerializedHighlight = {
  id: string;
  title: string;
  body: string;
  accent: HighlightAccent;
  createdAt: Date | string | undefined;
  updatedAt: Date | string | undefined;
  // Aggregated reaction counts (only emojis with at least one reaction),
  // ordered by the curated palette so the bar is stable across renders.
  reactions: { emoji: string; count: number }[];
  totalReactions: number;
  // The viewing member's own reaction, if any — drives the "selected" state.
  myReaction: string | null;
};

export function serializeHighlight(h: any, viewerId?: string): SerializedHighlight {
  const raw: any[] = Array.isArray(h.reactions) ? h.reactions : [];
  const counts = new Map<string, number>();
  let myReaction: string | null = null;
  for (const r of raw) {
    if (!r?.emoji) continue;
    counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
    if (viewerId && String(r.userId) === String(viewerId)) myReaction = r.emoji;
  }
  const reactions = HIGHLIGHT_REACTIONS.filter((e) => counts.has(e)).map((e) => ({
    emoji: e,
    count: counts.get(e) || 0,
  }));
  const accent: HighlightAccent = (HIGHLIGHT_ACCENTS as readonly string[]).includes(h.accent)
    ? h.accent
    : 'blue';
  return {
    id: String(h._id),
    title: h.title,
    body: h.body || '',
    accent,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    reactions,
    totalReactions: raw.length,
    myReaction,
  };
}

/** Toggle a member's reaction on a highlight doc in place (mutates `reactions`).
 *  One reaction per member: same emoji → remove, different → switch, none → add.
 *  Returns whether the result is a *newly added or switched* reaction (so the
 *  caller can decide whether to notify the owner). */
export function applyReactionToggle(reactions: any[], viewerId: string, emoji: string): { added: boolean } {
  const idx = reactions.findIndex((r) => String(r.userId) === String(viewerId));
  if (idx === -1) {
    reactions.push({ userId: new Types.ObjectId(viewerId), emoji, at: new Date() });
    return { added: true };
  }
  if (reactions[idx].emoji === emoji) {
    reactions.splice(idx, 1);
    return { added: false };
  }
  reactions[idx].emoji = emoji;
  reactions[idx].at = new Date();
  return { added: true };
}
