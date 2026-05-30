import type { ReactNode } from "react";

type IconProps = { className?: string };
const I = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className || "w-4 h-4"}>{children}</svg>
);

export const Icons = {
  search:    (p: IconProps) => <I className={p.className}><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></I>,
  plus:      (p: IconProps) => <I className={p.className}><path d="M8 3v10M3 8h10" /></I>,
  briefcase: (p: IconProps) => <I className={p.className}><rect x="2" y="5" width="12" height="9" rx="1.5" /><path d="M6 5V3.5C6 3 6.5 2.5 7 2.5h2c.5 0 1 .5 1 1V5M2 9h12" /></I>,
  grid:      (p: IconProps) => <I className={p.className}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></I>,
  user:      (p: IconProps) => <I className={p.className}><circle cx="8" cy="6" r="2.6" /><path d="M3 14c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" /></I>,
  bell:      (p: IconProps) => <I className={p.className}><path d="M4 7a4 4 0 018 0v3l1.2 2H2.8L4 10V7z" /><path d="M6.5 13.5a1.5 1.5 0 003 0" /></I>,
  settings:  (p: IconProps) => <I className={p.className}><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" /></I>,
  lock:      (p: IconProps) => <I className={p.className}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0v2" /></I>,
  unlock:    (p: IconProps) => <I className={p.className}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 015.7-1.3" /></I>,
  wallet:    (p: IconProps) => <I className={p.className}><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="M2 6h12M11 9.5h.5" /></I>,
  check:     (p: IconProps) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={p.className || "w-4 h-4"}><path d="M3 8.5L6.5 12 13 4.5" /></svg>,
  x:         (p: IconProps) => <I className={p.className}><path d="M4 4l8 8M12 4l-8 8" /></I>,
  chevR:     (p: IconProps) => <I className={p.className}><path d="M6 4l4 4-4 4" /></I>,
  arrR:      (p: IconProps) => <I className={p.className}><path d="M3 8h10M9 4l4 4-4 4" /></I>,
  ext:       (p: IconProps) => <I className={p.className}><path d="M6 3H3v10h10v-3M9 3h4v4M13 3l-6 6" /></I>,
  clock:     (p: IconProps) => <I className={p.className}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.2 1.5" /></I>,
  send:      (p: IconProps) => <I className={p.className}><path d="M14 2L7 9M14 2l-5 12-2-5-5-2 12-5z" /></I>,
  flag:      (p: IconProps) => <I className={p.className}><path d="M3 2v12M3 3h8l-1.5 2.5L11 8H3" /></I>,
  paper:     (p: IconProps) => <I className={p.className}><path d="M4 2h6l3 3v9H4z" /><path d="M10 2v3h3" /></I>,
  copy:      (p: IconProps) => <I className={p.className}><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M2 10V3a1 1 0 011-1h7" /></I>,
};
