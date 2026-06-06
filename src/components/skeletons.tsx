// Shared, server-safe skeleton kit — the single source of truth for every
// route's `loading.tsx`. No 'use client', no hooks, no JS: these paint
// instantly between navigations and hydrate away when the real page streams in.
//
// Every loader in the app composes from these primitives so the whole product
// speaks one loading language — same shimmer, same spacing, same landing mark.
import type { ReactNode } from 'react';
import { BirdLandingLoader } from './BirdsEyeLoader';

/** Outer page wrapper — matches the app's standard page padding + max width. */
export function PageSkeleton({
  children,
  width = 'max-w-[1440px]',
}: {
  children: ReactNode;
  width?: string;
}) {
  return <div className={`pb-12 ${width}`}>{children}</div>;
}

/** Page title + subtitle, with an optional right-aligned action placeholder. */
export function HeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
      <div className="space-y-2">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-3 w-72 max-w-full" />
      </div>
      {action && <div className="skeleton h-9 w-32 rounded-xl" />}
    </div>
  );
}

/** A horizontal row of filter / tab pills. */
export function FilterRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-2 mb-5 flex-wrap">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-8 w-28 rounded-lg" />
      ))}
    </div>
  );
}

/** Responsive grid of card placeholders. `height` tunes card height (e.g. taller for charts). */
export function CardGridSkeleton({
  count = 6,
  height = 'h-44',
}: {
  count?: number;
  height?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        // Negative per-item delay offsets each card's shimmer so the wave reads
        // as a diagonal sweep across the grid rather than every tile pulsing in
        // lockstep — feels organic, not mechanical.
        <div
          key={i}
          className={`skeleton w-full rounded-2xl ${height}`}
          style={{ animationDelay: `${(i % 3) * -0.15 + Math.floor(i / 3) * -0.1}s` }}
        />
      ))}
    </div>
  );
}

/** Vertical stack of list-row placeholders. */
export function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-16 w-full rounded-xl"
          style={{ animationDelay: `${i * -0.08}s` }}
        />
      ))}
    </div>
  );
}

/** Two-column detail layout (main + sidebar) beneath the landing mark.
 *  The shared shape for any record-detail route. */
export function DetailSkeleton({ label }: { label?: string }) {
  return (
    <div className="pb-12 max-w-[1440px]">
      <BirdLandingLoader label={label} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-20 w-full rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="skeleton h-48 w-full rounded-2xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Centred single-column panel for tool / form / chat routes
 *  (new project, triage, copilot). */
export function PanelSkeleton({ label }: { label?: string }) {
  return (
    <div className="pb-12 max-w-[900px]">
      <BirdLandingLoader label={label} />
      <div className="space-y-4">
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="skeleton h-24 w-full rounded-2xl" />
          <div className="skeleton h-24 w-full rounded-2xl" />
        </div>
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}
