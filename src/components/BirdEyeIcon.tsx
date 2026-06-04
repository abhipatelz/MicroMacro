'use client';

/**
 * Custom Bird's-Eye glyph used as the trigger icon across the app.
 * A circular "lens" containing a compact tree silhouette — reads as both a
 * compass (top-down vantage) and an org chart (the actual content). Strokes
 * follow the brand palette: brand blue trunk with an emerald root node.
 *
 * Pass `blink` to draw attention on first paint — pulses the outer ring twice
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
      {/* Outer lens */}
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
      {/* Trunk node (root, top) */}
      <circle cx="12" cy="6.5" r="1.6" fill="currentColor" />
      {/* Trunk → branch */}
      <path d="M12 8.1 V11.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Branch — symmetric Y */}
      <path d="M12 11.6 L7.4 15.2 M12 11.6 L16.6 15.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Leaf nodes */}
      <circle cx="7.4" cy="16" r="1.35" fill="#22c55e" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="16.6" cy="16" r="1.35" fill="#22c55e" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
