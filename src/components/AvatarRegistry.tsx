'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Avatar } from './ui';
import { api } from '@/lib/client/api';

/**
 * Avatar registry — a session-wide cache of every user's monogram style.
 *
 * Mounted once in AppShell and exposes a userId → {letter, bg, font} lookup.
 * The <UserAvatar> component consults it, so any other user's customised
 * monogram renders everywhere their avatar appears (member lists, comments,
 * assignees, contributors…) without each individual list endpoint having to
 * carry the avatar fields.
 *
 * Zero-flash: the registry is seeded *server-side* — the authed layout reads
 * every customised avatar from the DB and passes it as `initial`, so the very
 * first SSR paint already renders the right monograms. A single client fetch
 * afterwards keeps the map fresh if avatars changed mid-session. `seed` is the
 * current user's own style, kept in sync with CurrentUser so a self-edit (which
 * triggers router.refresh) propagates to their own rows in lists too.
 */

type AvatarStyle = { letter: string; bg: string; font: number };
type Registry = Record<string, AvatarStyle>;

const Ctx = createContext<Registry>({});

export function AvatarRegistryProvider({
  seed, initial, children,
}: {
  // Current user's own style, so self renders correctly before/around the fetch.
  seed?: { id: string; letter?: string; bg?: string; font?: number };
  // Server-seeded map of every customised avatar — eliminates first-paint flash.
  initial?: Registry;
  children: React.ReactNode;
}) {
  const [registry, setRegistry] = useState<Registry>(() => {
    const base: Registry = { ...(initial || {}) };
    if (seed?.id && seed.bg) {
      base[seed.id] = { letter: seed.letter || '', bg: seed.bg, font: seed.font ?? 0 };
    }
    return base;
  });

  // Keep the current user's own entry live. AppShell rebuilds `seed` from the
  // CurrentUser prop, so after a self-edit (settings → router.refresh) the new
  // values flow in here without a hard reload. Deps are primitives so this
  // only runs when one of them actually changes.
  useEffect(() => {
    if (!seed?.id || !seed.bg) return;
    setRegistry((prev) => ({ ...prev, [seed.id]: { letter: seed.letter || '', bg: seed.bg!, font: seed.font ?? 0 } }));
  }, [seed?.id, seed?.letter, seed?.bg, seed?.font]);

  // Refresh the rest of the map once on mount — covers avatars changed by
  // others since the SSR snapshot. Fetched values win over the initial seed.
  useEffect(() => {
    let alive = true;
    api<{ avatars: Registry }>('/users/avatars')
      .then((d) => {
        if (!alive) return;
        setRegistry((prev) => ({ ...prev, ...d.avatars }));
      })
      .catch(() => { /* keep the SSR-seeded map; fall back to initials otherwise */ });
    return () => { alive = false; };
  }, []);

  return <Ctx.Provider value={registry}>{children}</Ctx.Provider>;
}

export function useAvatarStyle(userId?: string | null): AvatarStyle | undefined {
  const reg = useContext(Ctx);
  if (!userId) return undefined;
  return reg[userId];
}

/**
 * Drop-in replacement for <Avatar> when rendering *another* user — pass their
 * userId and the component resolves their monogram from the registry. Renders
 * the plain name-derived avatar until (or unless) a custom style is found.
 * Safe to use inside server components: it's a client component, so it
 * hydrates and resolves on the client.
 */
export function UserAvatar({
  userId, name, size = 28,
}: { userId?: string | null; name?: string | null; size?: number }) {
  const style = useAvatarStyle(userId);
  return <Avatar name={name} size={size} letter={style?.letter} bg={style?.bg} font={style?.font} />;
}
