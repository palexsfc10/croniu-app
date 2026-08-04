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

export function IconWhatsApp({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12.7 7.4L3.5 20l1.2-4.1A8.5 8.5 0 1 1 20.5 11.5Z" />
      <path d="M9.2 9.3c.3-.6.5-.6.7-.6h.6c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.3.4.8 1 1.4 1.5.7.6 1.3.9 1.6 1 .3.1.5.1.6-.1l.7-.8c.2-.2.4-.1.6 0l1.6.8c.2.1.4.2.4.5 0 .7-.5 2-1.4 2.2-.7.2-1.7.1-3-.5-1.4-.7-2.8-1.9-3.9-3.4-1-1.3-1.5-2.5-1.6-3.2 0-.8.5-1.4 1-1.7Z" />
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
