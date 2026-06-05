'use client';

/**
 * Custom Whiteboard glyph used as the trigger icon for the My Day whiteboard.
 *
 * A board on a stand with a marker pen resting at its corner — reads as
 * "whiteboard" at a glance in a way the generic Presentation lucide icon
 * doesn't. Drawn so the pen is the active accent (brand emerald) and the
 * board is the calmer fill — your eye lands on the writing implement first.
 */
export function WhiteboardIcon({
  size = 20,
  className = '',
  title = 'Whiteboard',
  filled = false,
}: {
  size?: number;
  className?: string;
  title?: string;
  /** When true, fills the board with white for use on coloured backgrounds. */
  filled?: boolean;
}) {
  const stroke = 'currentColor';
  const boardFill = filled ? 'rgba(255,255,255,0.18)' : 'none';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {/* Board frame */}
      <rect
        x="2.5"
        y="3.5"
        width="19"
        height="13"
        rx="2"
        ry="2"
        fill={boardFill}
        stroke={stroke}
        strokeWidth="1.6"
      />
      {/* Two short stand legs */}
      <path d="M8 17 L7 21" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 17 L17 21" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      {/* A short sketch line on the board — signals "you draw here" */}
      <path
        d="M6 8 L13 8"
        stroke={stroke}
        strokeOpacity="0.55"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M6 12 L11 12"
        stroke={stroke}
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Pen — body angled across the board, tip pointing into the writing area.
          Slightly thicker outline + emerald accent so the pen is the eye-magnet
          element of the glyph. */}
      <g>
        <path
          d="M15.5 13.2 L19.2 9.5 L20.8 11.1 L17.1 14.8 Z"
          fill={filled ? '#22C55E' : 'none'}
          stroke={filled ? '#22C55E' : stroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Pen tip */}
        <path
          d="M15.5 13.2 L14.3 16 L17.1 14.8 Z"
          fill={filled ? '#22C55E' : stroke}
          stroke={filled ? '#22C55E' : stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
