'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Avatar } from './ui';
import { api } from '@/lib/client/api';

/**
 * Avatar registry — a session-wide cache of every user's monogram style.
 *
 * Mounted once in AppShell, it fetches /api/users/avatars a single time and
 * exposes a userId → {letter, bg, font} lookup. The <UserAvatar> component
 * consults it, so any other user's customised monogram renders everywhere
 * their avatar appears (member lists, comments, assignees, contributors…)
 * without each individual list endpoint having to carry the avatar fields.
 *
 * Self is seeded synchronously from CurrentUser so the current user's own
 * avatar is correct on first paint (no flash). Everyone else resolves once
 * the fetch returns; until then they render the name-derived fallback.
 */

type AvatarStyle = { letter: string; bg: string; font: number };
type Registry = Record<string, AvatarStyle>;

const Ctx = createContext<Registry>({});

export function AvatarRegistryProvider({
  seed, children,
}: {
  // Current user's own style, so self renders correctly before the fetch.
  seed?: { id: string; letter?: string; bg?: string; font?: number };
  children: React.ReactNode;
}) {
  const [registry, setRegistry] = useState<Registry>(() => {
    if (seed?.id && seed.bg) {
      return { [seed.id]: { letter: seed.letter || '', bg: seed.bg, font: seed.font ?? 0 } };
    }
    return {};
  });

  useEffect(() => {
    let alive = true;
    api<{ avatars: Registry }>('/users/avatars')
      .then((d) => {
        if (!alive) return;
        // Merge fetched styles over the seed (seed wins only if fetch lacks it).
        setRegistry((prev) => ({ ...d.avatars, ...prev }));
      })
      .catch(() => { /* fall back to initials for everyone */ });
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
