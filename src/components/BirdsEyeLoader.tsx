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
  label = "Bird's-eye view, loading…",
  sublabel = 'Pragati — progress, one step at a time.',
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
      <div className={`relative ${ring}`}>
        <div
          className="absolute inset-0 rounded-3xl"
          style={{
            background: 'conic-gradient(from 0deg, #1565C0 0%, #2E7D32 50%, #1565C0 100%)',
            animation: 'pragati-spin 1.4s linear infinite',
            filter: 'blur(2px)',
            opacity: 0.55,
          }}
        />
        <div className="absolute inset-1.5 flex items-center justify-center rounded-2xl bg-white">
          <PragatiMark size={mark} flat />
        </div>
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
