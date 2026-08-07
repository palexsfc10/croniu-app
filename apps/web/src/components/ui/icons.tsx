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

export function IconUser({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function IconSparkles({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <path d="m6.5 6.5 2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconAlertCircle({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

export function IconMic({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function IconSend({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconPlus({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChevronDown({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconMapPin({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconSliders({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </svg>
  );
}

export function IconCreditCard({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

export function IconLifeBuoy({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="m7.2 7.2 2.1 2.1M14.7 14.7l2.1 2.1M14.7 9.3l2.1-2.1M7.2 16.8l2.1-2.1" />
    </svg>
  );
}

export function IconLogOut({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IconBriefcase({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function IconLayers({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}

export function IconStop({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function IconX({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCalendarPlus({ className = "", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${base} ${className}`} aria-hidden {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
    </svg>
  );
}
