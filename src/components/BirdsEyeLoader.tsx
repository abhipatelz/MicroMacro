import { PragatiMark } from '@/components/PragatiMark';

/**
 * Shared "bird's-eye view" loading visual — the same brand-forward loader the
 * dashboard route uses between server fetches, lifted into a component so every
 * in-app loading state (profile, unlock, etc.) feels identical instead of each
 * surface inventing its own raw spinner.
 *
 * `inline` drops the tall min-height so it can sit inside a card or modal.
 */
export function BirdsEyeLoader({
  label = "Ascending…",
  sublabel = 'Getting your bird\'s-eye view ready.',
  size = 'md',
  inline = false,
}: {
  label?: string;
  sublabel?: string;
  size?: 'sm' | 'md';
  inline?: boolean;
}) {
  const mark = size === 'sm' ? 36 : 48;
  const ring = size === 'sm' ? 'w-14 h-14' : 'w-20 h-20';
  return (
    <div className={`flex flex-col items-center justify-center gap-5 ${inline ? 'py-10' : 'min-h-[60vh]'}`}>
      {/* The mark sits perfectly still and crisp; only a thin ring rotates
          around it. (The old loader spun a blurred conic-gradient *behind* the
          icon, which read as the logo squeezing/warping on every app open.) */}
      <div className={`relative ${ring} flex items-center justify-center`}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: '2.5px solid #e8edf4',
            borderTopColor: '#1565C0',
            borderRightColor: '#2E7D32',
            animation: 'pragati-spin 0.9s linear infinite',
          }}
        />
        <PragatiMark size={mark} flat />
      </div>

      {(label || sublabel) && (
        <div className="text-center">
          {label && (
            <div className={`font-bold text-slate-800 tracking-tight ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
              {label}
            </div>
          )}
          {sublabel && <div className="text-xs text-slate-400 mt-1">{sublabel}</div>}
        </div>
      )}

      <style>{`@keyframes pragati-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/**
 * Bird-landing loader — the Pragati mark drops in from above and settles onto a
 * title-row placeholder, echoing the feeling of swooping from the dashboard's
 * bird's-eye view down into a single record. Used at the top of the project,
 * task and team detail loading screens, above their skeletons.
 */
export function BirdLandingLoader({ label = 'Coming in to land…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="relative">
        <div className="bird-land">
          <PragatiMark size={34} flat />
        </div>
        {/* Soft contact shadow that spreads as the mark settles. */}
        <div
          aria-hidden
          className="bird-shadow absolute left-1/2 -translate-x-1/2 -bottom-1 h-1 w-8 rounded-full"
          style={{ background: 'rgba(15,23,42,0.18)', filter: 'blur(1.5px)' }}
        />
      </div>
      <div className="space-y-1.5">
        <div className="skeleton h-3.5 w-40 rounded" />
        <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      </div>
    </div>
  );
}
