'use client';
import { useEffect, useState } from 'react';

// Reactive dark-mode flag. Mirrors the `dark` class that AppShell toggles on
// <html>. Unlike a one-shot read, this re-renders when the theme flips, so
// components with inline (non-Tailwind) colors stay in sync with the toggle.
export function useIsDark(): boolean {
  const [dark, setDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
