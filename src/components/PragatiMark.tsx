/** Pragati's brand mark — CSS / SVG only, no image asset.
 *
 *  A rounded square in the brand blue-to-forest gradient, with a stylised
 *  "P" built from a vertical stem, an outer arc, and an inner forward-motion
 *  accent. The accent is what makes it feel like "pragati" (progress) — it
 *  reads as a forward-moving wedge inside the loop of the P.
 *
 *  Use this everywhere the app needs a logo (login, signup, forgot-password,
 *  sidebar, loading state). No external assets, no corporate logo.
 */
export function PragatiMark({
  size      = 96,
  /** when true, drops the glow + heavy shadow (good for inline use in the sidebar) */
  flat      = false,
  className = '',
}: {
  size?: number;
  flat?: boolean;
  className?: string;
}) {
  const radius = size * 0.26;
  const shadow = flat
    ? 'inset 0 1px 0 rgba(255,255,255,0.22)'
    : 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.18), ' +
      '0 18px 48px rgba(21,101,192,0.40), 0 6px 14px rgba(0,0,0,0.18)';

  return (
    <div
      aria-label="Pragati"
      role="img"
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{
        width:  size,
        height: size,
        borderRadius: radius,
        background: 'linear-gradient(135deg, #1565C0 0%, #1769C8 45%, #2B8C29 100%)',
        boxShadow: shadow,
      }}
    >
      {/* Inner glossy ring */}
      <div
        className="absolute"
        style={{
          inset: Math.max(2, size * 0.04),
          borderRadius: radius * 0.86,
          background: 'linear-gradient(155deg, rgba(255,255,255,0.10) 0%, transparent 55%)',
        }}
      />

      {/* Stylised P */}
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 64 64" className="relative">
        <rect x="14" y="10" width="8" height="44" rx="3" fill="#ffffff" />
        <path
          d="M22 12 H34 a18 18 0 0 1 0 36 H22"
          stroke="#ffffff" strokeWidth="8" strokeLinecap="round" fill="none"
        />
        <path
          d="M28 22 H34 a8 8 0 0 1 0 16 H28"
          stroke="#A7E3B2" strokeWidth="3" strokeLinecap="round" fill="none"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}
