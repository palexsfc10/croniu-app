import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base =
  "h-5 w-5 shrink-0 fill-none stroke-current [stroke-width:1.75] [stroke-linecap:round] [stroke-linejoin:round]";

export function IconHome({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

export function IconCalendarDays({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

export function IconUsersRound({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M18 21a6 6 0 0 0-12 0" />
      <circle cx="12" cy="8" r="4" />
      <path d="M22 21a4.5 4.5 0 0 0-5.5-4.35" />
      <path d="M2 21a4.5 4.5 0 0 1 5.5-4.35" />
    </svg>
  );
}

export function IconRefreshCw({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M3 12a9 9 0 0 1 14.65-7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-14.65 7L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function IconLayoutGrid({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function IconBanknote({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

export function IconCopy({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
