'use client';

/**
 * Custom Bird's-Eye glyph used as the trigger icon across the app.
 * A compact tree-of-nodes with a glowing root, brand-blue branches and
 * emerald leaves — reads as "see the whole structure from above". The
 * outer lens is dropped in favour of more visual breathing room around
 * the tree itself, which renders better at small sizes.
 *
 * Pass `blink` to draw attention on first paint — pulses the icon twice
 * then settles. Useful as a feature-discovery cue without a tour modal.
 */
export function BirdEyeIcon({
  size = 18,
  className = '',
  blink = false,
  title = "Bird's-eye view",
}: {
  size?: number;
  className?: string;
  blink?: boolean;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={`${blink ? 'pragati-birdeye-blink' : ''} ${className}`.trim()}
    >
      <title>{title}</title>
      {/* Soft gradient lens — gives the icon presence without a hard border */}
      <defs>
        <radialGradient id="be-lens" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1565C0" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#1565C0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#be-lens)" />
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.1" fill="none" />

      {/* Branches — drawn before nodes so node fills cover the join cleanly */}
      <path d="M12 5.5 V11" stroke="#1565C0" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 11 L6.5 16.2 M12 11 L17.5 16.2 M12 11 V16.2"
            stroke="#1565C0" strokeWidth="1.5" strokeLinecap="round" />

      {/* Root node — brand blue, prominent */}
      <circle cx="12" cy="5.5" r="2" fill="#1565C0" />
      <circle cx="12" cy="5.5" r="2" fill="white" fillOpacity="0.18" />

      {/* Mid junction */}
      <circle cx="12" cy="11" r="1.2" fill="#1565C0" />

      {/* Three leaf nodes — emerald, slightly different sizes for life */}
      <circle cx="6.5"  cy="17"   r="1.6" fill="#10b981" stroke="white" strokeWidth="0.6" />
      <circle cx="12"   cy="17"   r="1.6" fill="#10b981" stroke="white" strokeWidth="0.6" />
      <circle cx="17.5" cy="17"   r="1.6" fill="#10b981" stroke="white" strokeWidth="0.6" />
    </svg>
  );
}
