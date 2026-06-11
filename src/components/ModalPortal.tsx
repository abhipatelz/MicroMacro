'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a modal as a direct child of <body>.
 *
 * Every dialog must go through this. Modals rendered inline inside page
 * content sit below ancestors that can carry a transform/filter (entrance
 * animations, etc.) — any such ancestor becomes the containing block for
 * `position: fixed`, and the backdrop then stops short of the real viewport
 * (the "light strip above the overlay" bug). Portaling to <body> removes
 * every ancestor between the overlay and the viewport, so `inset-0` always
 * means the actual screen. (BirdsEyeView and the tour already did this —
 * which is why they never showed the strip.)
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  // SSR-safe: document doesn't exist on the server; mounting on the client
  // first paint is fine because modals are interaction-triggered anyway.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
