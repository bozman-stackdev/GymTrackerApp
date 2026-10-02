/**
 * The app's icon set: simple 24×24 line icons drawn with `currentColor`, so they follow the text colour, the theme and
 * the accent. Replaces emoji, which look different on every phone (the 📅 icon even showed a fixed date).
 * Decorative by default (aria-hidden); pass `label` when the icon is the only content of a control.
 */
import type { ReactNode } from 'react';

const PATHS = {
  back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  forward: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  minus: <path d="M5 12h14" />,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  play: <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><circle cx="12" cy="13" r="3.5" /></>,
  dumbbell: <><path d="M6.5 6.5v11" /><path d="M17.5 6.5v11" /><path d="M3.5 9v6" /><path d="M20.5 9v6" /><path d="M6.5 12h11" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M8 2.5v4" /><path d="M16 2.5v4" /><path d="M3 10h18" /></>,
  pin: <><path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  user: <><circle cx="12" cy="8" r="4.5" /><path d="M20 21a8 8 0 0 0-16 0" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  flame: <path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.3-6-4-7.7-.4 1.9-1.4 3-2.5 3.5.2-3.1-1.3-6.4-4-8-.2 3.2-1.6 5-3 6.7C4.3 11.2 5 12.9 5 15.2 5 19.3 8 22 12 22Z" />,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4.5a1.5 1.5 0 0 0-1.5 1.5c0 2 1.6 3.5 4 3.5" /><path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5c0 2-1.6 3.5-4 3.5" /><path d="M12 14v4" /><path d="M8 21h8" /><path d="M9.5 18h5" /></>,
  star: <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9Z" />,
  lock: <><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  settings: <><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" /><path d="M4 17h2" /><path d="M10 17h10" /><circle cx="8" cy="17" r="2" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  save: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  alert: <><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.5" /><path d="M12 17h.01" /></>,
  arrowUp: <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  arrowDown: <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>,
  wave: <><path d="M7 11.5V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M10 10V4a1.5 1.5 0 0 1 3 0v6" /><path d="M13 10V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a7 7 0 0 1-5.6-2.8L3.6 15a1.5 1.5 0 0 1 2.3-1.9L7 14.3" /></>,
  flag: <><path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" /></>,
  medal: <><circle cx="12" cy="15" r="6" /><path d="M8.5 9.8 5.5 2.5h4l2.5 5" /><path d="m15.5 9.8 3-7.3h-4L12 7.5" /><path d="m12 12.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3Z" /></>,
  ten: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 9v6" /><path d="M7 10l1-1" /><rect x="12" y="9" width="4.5" height="6" rx="2.25" /></>,
  circleCheck: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.7L16 9.5" /></>,
  halfCircle: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /></>,
  pause: <><rect x="6.5" y="5" width="3.5" height="14" rx="1" /><rect x="14" y="5" width="3.5" height="14" rx="1" /></>,
  hourglass: <><path d="M6 2.5h12" /><path d="M6 21.5h12" /><path d="M7.5 2.5v3.5a4.5 4.5 0 0 0 9 0V2.5" /><path d="M7.5 21.5V18a4.5 4.5 0 0 1 9 0v3.5" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  heartbeat: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5" /><path d="M12 19.5V22" /><path d="m4.9 4.9 1.8 1.8" /><path d="m17.3 17.3 1.8 1.8" /><path d="M2 12h2.5" /><path d="M19.5 12H22" /><path d="m4.9 19.1 1.8-1.8" /><path d="m17.3 6.7 1.8-1.8" /></>,
  snowflake: <><path d="M12 2v20" /><path d="m4.4 7 15.2 10" /><path d="m4.4 17 15.2-10" /><path d="m9 3.5 3 3 3-3" /><path d="m9 20.5 3-3 3 3" /></>,
  cloud: <path d="M17.5 19H8a6 6 0 1 1 5.7-7.9H15a4 4 0 0 1 2.5 7.9Z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];
